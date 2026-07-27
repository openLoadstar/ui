package com.loadstar.explorer.service;

import com.loadstar.explorer.model.GitCommitDetail;
import com.loadstar.explorer.model.GitCommitInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class GitService {

    /**
     * Get git commit history for a specific element file.
     */
    public List<GitCommitInfo> getFileHistory(String projectRoot, String address) {
        Path filePath = addressToRelativePath(address);
        List<GitCommitInfo> result = new ArrayList<>();

        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "git", "log",
                    "--pretty=format:%H|%ai|%an|%s",
                    "--", filePath.toString().replace("\\", "/")
            );
            pb.directory(new File(projectRoot));
            pb.redirectErrorStream(true);

            Process process = pb.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    String[] parts = line.split("\\|", 4);
                    if (parts.length >= 4) {
                        GitCommitInfo info = new GitCommitInfo();
                        info.setHash(parts[0].trim());
                        info.setDate(parts[1].trim());
                        info.setAuthor(parts[2].trim());
                        info.setMessage(parts[3].trim());
                        result.add(info);
                    }
                }
            }

            boolean finished = process.waitFor(15, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                log.warn("git log timed out for {}", address);
            }
        } catch (Exception e) {
            log.error("Failed to get git history for {}: {}", address, e.getMessage());
        }

        return result;
    }

    /**
     * Get file content at a specific commit hash.
     * Uses: git show {hash}:{repoRelativePath}
     * Supports projectRoot == repo root and projectRoot == subdirectory of repo root.
     */
    public String getFileAtCommit(String projectRoot, String address, String hash) {
        Path filePath = addressToRelativePath(address);
        String gitPath = filePath.toString().replace("\\", "/");

        try {
            String repoRoot = getGitRepoRoot(projectRoot);
            String prefix = getSubdirPrefix(repoRoot, projectRoot);
            String repoRelativePath = prefix.isEmpty() ? gitPath : prefix + "/" + gitPath;

            ProcessBuilder pb = new ProcessBuilder(
                    "git", "show", hash + ":" + repoRelativePath
            );
            pb.directory(new File(repoRoot));
            pb.redirectErrorStream(true);

            Process process = pb.start();
            StringBuilder content = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    content.append(line).append("\n");
                }
            }

            boolean finished = process.waitFor(15, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new RuntimeException("git show timed out");
            }

            if (process.exitValue() != 0) {
                throw new RuntimeException("git show failed: " + content);
            }

            return content.toString();
        } catch (Exception e) {
            log.error("Failed to get file at commit {} for {}: {}", hash, address, e.getMessage());
            throw new RuntimeException("Failed to get file at commit: " + e.getMessage(), e);
        }
    }

    /**
     * Get project-wide git log for .loadstar/ directory.
     */
    public List<GitCommitInfo> getProjectLog(String projectRoot, int limit) {
        List<GitCommitInfo> result = new ArrayList<>();
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "git", "log",
                    "--pretty=format:%H|%ai|%an|%s",
                    "-n", String.valueOf(limit),
                    "--", ".loadstar/"
            );
            pb.directory(new File(projectRoot));
            pb.redirectErrorStream(true);

            Process process = pb.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    String[] parts = line.split("\\|", 4);
                    if (parts.length >= 4) {
                        GitCommitInfo info = new GitCommitInfo();
                        info.setHash(parts[0].trim());
                        info.setDate(parts[1].trim());
                        info.setAuthor(parts[2].trim());
                        info.setMessage(parts[3].trim());
                        result.add(info);
                    }
                }
            }
            process.waitFor(15, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.error("Failed to get project log: {}", e.getMessage());
        }
        return result;
    }

    /**
     * Get commit detail: changed files with stat.
     */
    public GitCommitDetail getCommitDetail(String projectRoot, String hash) {
        GitCommitDetail detail = new GitCommitDetail();
        detail.setHash(hash);
        detail.setFiles(new ArrayList<>());

        try {
            String repoRoot = getGitRepoRoot(projectRoot);
            String prefix = getSubdirPrefix(repoRoot, projectRoot);
            String loadstarFilter = prefix.isEmpty() ? ".loadstar/" : prefix + "/.loadstar/";

            // Get commit message and meta
            ProcessBuilder pb1 = new ProcessBuilder(
                    "git", "show", "--no-patch", "--pretty=format:%ai|%an|%s", hash
            );
            pb1.directory(new File(repoRoot));
            pb1.redirectErrorStream(true);
            Process p1 = pb1.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(p1.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine();
                if (line != null) {
                    String[] parts = line.split("\\|", 3);
                    if (parts.length >= 3) {
                        detail.setDate(parts[0].trim());
                        detail.setAuthor(parts[1].trim());
                        detail.setMessage(parts[2].trim());
                    }
                }
            }
            p1.waitFor(10, TimeUnit.SECONDS);

            // Get changed files (stat)
            ProcessBuilder pb2 = new ProcessBuilder(
                    "git", "diff-tree", "--no-commit-id", "-r", "--name-status", hash, "--", loadstarFilter
            );
            pb2.directory(new File(repoRoot));
            pb2.redirectErrorStream(true);
            Process p2 = pb2.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(p2.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    String[] parts = line.split("\\t", 2);
                    if (parts.length >= 2) {
                        GitCommitDetail.FileChange fc = new GitCommitDetail.FileChange();
                        fc.setChangeType(parts[0].trim());
                        fc.setFilePath(parts[1].trim());
                        detail.getFiles().add(fc);
                    }
                }
            }
            p2.waitFor(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.error("Failed to get commit detail for {}: {}", hash, e.getMessage());
        }
        return detail;
    }

    /**
     * Returns the git repository root for the given directory.
     * Works whether dir is the repo root or a subdirectory within it.
     */
    private String getGitRepoRoot(String dir) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("git", "rev-parse", "--show-toplevel");
        pb.directory(new File(dir));
        pb.redirectErrorStream(true);
        Process process = pb.start();
        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            output = reader.readLine();
        }
        process.waitFor(10, TimeUnit.SECONDS);
        if (process.exitValue() != 0 || output == null || output.isBlank()) {
            throw new RuntimeException("Not a git repository: " + dir);
        }
        return output.trim();
    }

    /**
     * Returns the relative path prefix from repoRoot to projectRoot.
     * Returns "" when they are the same directory, "subdir" when projectRoot = repoRoot/subdir.
     */
    private String getSubdirPrefix(String repoRoot, String projectRoot) {
        Path repoPath    = Paths.get(repoRoot).toAbsolutePath().normalize();
        Path projectPath = Paths.get(projectRoot).toAbsolutePath().normalize();
        if (repoPath.equals(projectPath)) {
            return "";
        }
        return repoPath.relativize(projectPath).toString().replace("\\", "/");
    }

    /**
     * Convert LOADSTAR address to relative file path within project.
     */
    private Path addressToRelativePath(String address) {
        String typeDir;
        String pathPart;

        if (address.startsWith("M://")) {
            typeDir = "MAP";
            pathPart = address.substring(4);
        } else if (address.startsWith("W://")) {
            typeDir = "WAYPOINT";
            pathPart = address.substring(4);
        } else {
            throw new IllegalArgumentException("Unknown address type: " + address);
        }

        String fileName = pathPart.replace("/", ".") + ".md";
        return Paths.get(".loadstar", typeDir, fileName);
    }
}
