export namespace main {
	
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

}

