export namespace main {
	
	export class DatedFile {
	    path: string;
	    modTime: string;
	
	    static createFrom(source: any = {}) {
	        return new DatedFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.modTime = source["modTime"];
	    }
	}
	export class GitCommit {
	    hash: string;
	    short: string;
	    author: string;
	    date: string;
	    subject: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new GitCommit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.short = source["short"];
	        this.author = source["author"];
	        this.date = source["date"];
	        this.subject = source["subject"];
	        this.path = source["path"];
	    }
	}
	export class GitHistory {
	    available: boolean;
	    reason: string;
	    dirty: boolean;
	    commits: GitCommit[];
	
	    static createFrom(source: any = {}) {
	        return new GitHistory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.reason = source["reason"];
	        this.dirty = source["dirty"];
	        this.commits = this.convertValues(source["commits"], GitCommit);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RecentFile {
	    path: string;
	    name: string;
	    openedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.openedAt = source["openedAt"];
	    }
	}
	export class RecentProject {
	    path: string;
	    name: string;
	    openedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentProject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.openedAt = source["openedAt"];
	    }
	}
	export class ReindexStats {
	    Nodes: number;
	    Edges: number;
	    BrokenEdges: number;
	
	    static createFrom(source: any = {}) {
	        return new ReindexStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Nodes = source["Nodes"];
	        this.Edges = source["Edges"];
	        this.BrokenEdges = source["BrokenEdges"];
	    }
	}
	export class SearchHit {
	    line: number;
	    text: string;
	    index: number;
	    lineCount: number;
	
	    static createFrom(source: any = {}) {
	        return new SearchHit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.line = source["line"];
	        this.text = source["text"];
	        this.index = source["index"];
	        this.lineCount = source["lineCount"];
	    }
	}
	export class SearchFileResult {
	    path: string;
	    count: number;
	    nameMatch: boolean;
	    hits: SearchHit[];
	    truncated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SearchFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.count = source["count"];
	        this.nameMatch = source["nameMatch"];
	        this.hits = this.convertValues(source["hits"], SearchHit);
	        this.truncated = source["truncated"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

