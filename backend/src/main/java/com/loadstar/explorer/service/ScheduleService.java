package com.loadstar.explorer.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final ElementParser parser;
    private final ObjectMapper objectMapper;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ISO_LOCAL_DATE;

    // ===== File path helpers =====

    private Path scheduleFile(String projectRoot) {
        return Paths.get(projectRoot, ".loadstar", "SCHEDULE", "schedule.json");
    }

    private Path wpFile(String projectRoot, String address) {
        String pathPart = address.substring(4); // strip W://
        return Paths.get(projectRoot, ".loadstar", "WAYPOINT", pathPart.replace("/", ".") + ".md");
    }

    private Path mapFile(String projectRoot, String address) {
        String pathPart = address.substring(4); // strip M://
        return Paths.get(projectRoot, ".loadstar", "MAP", pathPart.replace("/", ".") + ".md");
    }

    // ===== MAP DFS order =====

    private List<String> mapOrderedWps(String projectRoot, List<String> mapAddresses) {
        List<String> starts = (mapAddresses == null || mapAddresses.isEmpty())
                ? List.of("M://root")
                : mapAddresses;
        List<String> result = new ArrayList<>();
        Set<String> visitedMaps = new HashSet<>();
        Set<String> seenWps = new HashSet<>();
        for (String start : starts) {
            try {
                List<String> batch = new ArrayList<>();
                collectWps(projectRoot, start, batch, visitedMaps);
                for (String wp : batch) {
                    if (seenWps.add(wp)) result.add(wp);
                }
            } catch (Exception e) {
                log.warn("MAP DFS 순회 실패: {}", start, e);
            }
        }
        return result;
    }

    private void collectWps(String projectRoot, String mapAddr, List<String> out, Set<String> visited) throws IOException {
        if (!visited.add(mapAddr)) return;
        Path f = mapFile(projectRoot, mapAddr);
        if (!Files.exists(f)) return;
        for (String child : parser.parseMap(f).getWaypoints()) {
            if (child.startsWith("W://")) {
                out.add(child);
            } else if (child.startsWith("M://")) {
                collectWps(projectRoot, child, out, visited);
            }
        }
    }

    // ===== WP metadata (read-only) =====

    private WpMeta readWpMeta(String projectRoot, String address) {
        Path f = wpFile(projectRoot, address);
        if (!Files.exists(f)) return new WpMeta(false, "", false, false);
        try {
            List<String> lines = Files.readAllLines(f, StandardCharsets.UTF_8);
            String summary = "";
            boolean hasTask = false;
            boolean allDone = true;
            boolean hasRecurring = false;
            boolean inTodo = false;

            for (String raw : lines) {
                String t = raw.trim();
                if (t.startsWith("### ")) {
                    inTodo = t.equals("### TODO");
                    continue;
                }
                if (t.startsWith("- SUMMARY:")) {
                    summary = t.substring("- SUMMARY:".length()).trim();
                    continue;
                }
                if (inTodo) {
                    if (t.startsWith("- [x]") || t.startsWith("- [X]")) {
                        hasTask = true;
                    } else if (t.startsWith("- [ ]")) {
                        hasTask = true;
                        allDone = false;
                    } else if (t.startsWith("- (R)")) {
                        hasRecurring = true;
                    }
                }
            }

            boolean recurringOnly = !hasTask && hasRecurring;
            // 작업 항목이 없고 반복 항목도 없으면 완료로 처리 (TODO 없는 WP 포함)
            boolean completed = !recurringOnly && (!hasTask || allDone);
            return new WpMeta(true, summary, completed, recurringOnly);
        } catch (Exception e) {
            log.warn("WP 읽기 실패: {}", address, e);
            return new WpMeta(true, "", false, false);
        }
    }

    // ===== Status derivation =====

    private String deriveStatus(WpMeta meta) {
        if (!meta.exists()) return "MISSING";
        if (meta.recurringOnly()) return "RECURRING";
        if (meta.completed()) return "DONE";
        return "ACTIVE";
    }

    // ===== Public API =====

    public ScheduleResponse load(String projectRoot) throws IOException {
        ScheduleData data = loadOrCreate(projectRoot);
        // 최초 생성 또는 items가 비어있으면 MAP DFS로 전체 WP 초기화
        if (data.getItems() == null || data.getItems().isEmpty()) {
            return refreshStatus(projectRoot);
        }
        return buildResponse(projectRoot, data);
    }

    public ScheduleResponse save(String projectRoot, ScheduleData data) throws IOException {
        Path f = scheduleFile(projectRoot);
        Files.createDirectories(f.getParent());
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(Files.newBufferedWriter(f, StandardCharsets.UTF_8), data);
        return buildResponse(projectRoot, data);
    }

    public ScheduleResponse refreshStatus(String projectRoot) throws IOException {
        ScheduleData data = loadOrCreate(projectRoot);
        List<String> ordered = mapOrderedWps(projectRoot, data.getSelectedMaps());
        Map<String, ScheduleEntry> stored = data.getItems() != null ? data.getItems() : new LinkedHashMap<>();
        Map<String, ScheduleEntry> updated = new LinkedHashMap<>();
        String today = LocalDate.now().format(DATE_FMT);
        String defaultEnd = LocalDate.now().plusDays(7).format(DATE_FMT);

        for (String addr : ordered) {
            ScheduleEntry entry = stored.getOrDefault(addr, new ScheduleEntry(today, defaultEnd));
            entry.setStatus(deriveStatus(readWpMeta(projectRoot, addr)));
            updated.put(addr, entry);
        }
        // Preserve orphans with refreshed status
        for (Map.Entry<String, ScheduleEntry> e : stored.entrySet()) {
            if (!updated.containsKey(e.getKey())) {
                e.getValue().setStatus(deriveStatus(readWpMeta(projectRoot, e.getKey())));
                updated.put(e.getKey(), e.getValue());
            }
        }

        data.setItems(updated);
        Path f = scheduleFile(projectRoot);
        Files.createDirectories(f.getParent());
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(Files.newBufferedWriter(f, StandardCharsets.UTF_8), data);
        return buildResponse(projectRoot, data);
    }

    // ===== Internals =====

    private ScheduleData loadOrCreate(String projectRoot) throws IOException {
        Path f = scheduleFile(projectRoot);
        if (!Files.exists(f)) {
            ScheduleData empty = new ScheduleData();
            empty.setView(new ScheduleView(LocalDate.now().format(DATE_FMT), 30));
            empty.setItems(new LinkedHashMap<>());
            Files.createDirectories(f.getParent());
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(Files.newBufferedWriter(f, StandardCharsets.UTF_8), empty);
            return empty;
        }
        return objectMapper.readValue(Files.newBufferedReader(f, StandardCharsets.UTF_8), ScheduleData.class);
    }

    private String clampDate(String date, String min, String max) {
        if (date.compareTo(min) < 0) return min;
        if (date.compareTo(max) > 0) return max;
        return date;
    }

    private ScheduleResponse buildResponse(String projectRoot, ScheduleData data) {
        List<String> ordered = mapOrderedWps(projectRoot, data.getSelectedMaps());
        Map<String, ScheduleEntry> stored = data.getItems() != null ? data.getItems() : new LinkedHashMap<>();

        ScheduleView view = data.getView() != null ? data.getView() : new ScheduleView(LocalDate.now().format(DATE_FMT), 30);
        String viewStart = view.getStartDate();
        String viewEnd = LocalDate.parse(viewStart, DATE_FMT).plusDays(view.getDurationDays() - 1).format(DATE_FMT);
        String today = LocalDate.now().format(DATE_FMT);
        String defaultEnd = LocalDate.now().plusDays(7).format(DATE_FMT);

        List<ScheduleItemResponse> items = new ArrayList<>();
        Set<String> processed = new LinkedHashSet<>();

        for (int i = 0; i < ordered.size(); i++) {
            String addr = ordered.get(i);
            processed.add(addr);
            WpMeta meta = readWpMeta(projectRoot, addr);
            ScheduleEntry entry = stored.getOrDefault(addr, new ScheduleEntry(today, defaultEnd));
            items.add(toResponse(addr, meta, entry, i, viewStart, viewEnd, today, defaultEnd));
        }

        // MAP 필터 비활성 시에만 orphan 표시 (필터 활성이면 다른 MAP WP가 orphan으로 노출되는 문제 방지)
        boolean hasMapFilter = data.getSelectedMaps() != null && !data.getSelectedMaps().isEmpty();
        if (!hasMapFilter) {
            int orphanOrder = ordered.size();
            for (Map.Entry<String, ScheduleEntry> e : stored.entrySet()) {
                if (processed.contains(e.getKey())) continue;
                WpMeta meta = readWpMeta(projectRoot, e.getKey());
                items.add(toResponse(e.getKey(), meta, e.getValue(), orphanOrder++, viewStart, viewEnd, today, defaultEnd));
            }
        }

        ScheduleResponse resp = new ScheduleResponse();
        resp.setView(view);
        resp.setItems(items);
        resp.setSelectedMaps(data.getSelectedMaps());
        return resp;
    }

    private ScheduleItemResponse toResponse(String addr, WpMeta meta, ScheduleEntry entry, int order,
                                             String viewStart, String viewEnd, String today, String defaultEnd) {
        String start, end;
        if (meta.recurringOnly) {
            // Recurring items always span the full view period
            start = viewStart;
            end = viewEnd;
        } else {
            start = entry.getStart() != null ? entry.getStart() : today;
            end   = entry.getEnd()   != null ? entry.getEnd()   : defaultEnd;
            start = clampDate(start, viewStart, viewEnd);
            end   = clampDate(end,   viewStart, viewEnd);
            if (end.compareTo(start) < 0) end = start;
        }

        ScheduleItemResponse r = new ScheduleItemResponse();
        r.setAddress(addr);
        r.setSummary(meta.summary());
        r.setStart(start);
        r.setEnd(end);
        r.setExists(meta.exists());
        r.setCompleted(meta.completed());
        r.setRecurringOnly(meta.recurringOnly());
        r.setMapOrder(order);
        r.setStatus(deriveStatus(meta));
        return r;
    }

    // ===== Inner model classes =====

    @Data
    public static class ScheduleView {
        @JsonProperty("startDate")
        private String startDate;
        @JsonProperty("durationDays")
        private int durationDays;

        public ScheduleView() {}
        public ScheduleView(String startDate, int durationDays) {
            this.startDate = startDate;
            this.durationDays = durationDays;
        }
    }

    @Data
    public static class ScheduleEntry {
        private String start;
        private String end;
        @JsonProperty("status")
        private String status;

        public ScheduleEntry() {}
        public ScheduleEntry(String start, String end) {
            this.start = start;
            this.end = end;
        }
    }

    @Data
    public static class ScheduleData {
        private ScheduleView view;
        private Map<String, ScheduleEntry> items = new LinkedHashMap<>();
        @JsonProperty("selectedMaps")
        private List<String> selectedMaps;
    }

    @Data
    public static class ScheduleItemResponse {
        private String address;
        private String summary;
        private String start;
        private String end;
        private boolean exists;
        private boolean completed;
        private boolean recurringOnly;
        private int mapOrder;
        private String status; // "ACTIVE" | "DONE" | "RECURRING" | "MISSING"
    }

    @Data
    public static class ScheduleResponse {
        private ScheduleView view;
        private List<ScheduleItemResponse> items;
        @JsonProperty("selectedMaps")
        private List<String> selectedMaps;
    }

    private record WpMeta(boolean exists, String summary, boolean completed, boolean recurringOnly) {}
}
