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

}

