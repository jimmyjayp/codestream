"use strict";
import { Config } from "./config";
import { DocumentManager } from "./documentManager";
import { GitService } from "./git/gitService";
import { Logger } from "./logger";
import { FilesManager } from "./managers/filesManager";
import { MarkersManager } from "./managers/markersManager";
import { PostsManager } from "./managers/postsManager";
import { ReposManager } from "./managers/reposManager";
import { StreamsManager } from "./managers/streamsManager";
import { TeamsManager } from "./managers/teamsManager";
import { UsersManager } from "./managers/usersManager";
import { MarkerLocationManager } from "./markerLocation/markerLocationManager";
import { CodeStreamSession } from "./session";

class ServiceContainer {
	constructor(public readonly session: CodeStreamSession) {
		this._files = new FilesManager(session);
		this._markerLocations = new MarkerLocationManager();
		this._markers = new MarkersManager(session);
		this._posts = new PostsManager(session);
		this._repos = new ReposManager(session);
		this._streams = new StreamsManager(session);
		this._teams = new TeamsManager(session);
		this._users = new UsersManager(session);

		this._git = new GitService(session);

		this._documents = new DocumentManager();
		this._documents.listen(session.connection);
	}

	private readonly _documents: DocumentManager;
	get documents() {
		return this._documents;
	}

	private readonly _files: FilesManager;
	get files(): FilesManager {
		return this._files;
	}

	private readonly _git: GitService;
	get git() {
		return this._git;
	}

	private readonly _markerLocations: MarkerLocationManager;
	get markerLocations(): MarkerLocationManager {
		return this._markerLocations;
	}

	private readonly _markers: MarkersManager;
	get markers(): MarkersManager {
		return this._markers;
	}

	private readonly _posts: PostsManager;
	get posts(): PostsManager {
		return this._posts;
	}

	private readonly _repos: ReposManager;
	get repos(): ReposManager {
		return this._repos;
	}

	private readonly _streams: StreamsManager;
	get streams(): StreamsManager {
		return this._streams;
	}

	private readonly _teams: TeamsManager;
	get teams(): TeamsManager {
		return this._teams;
	}

	private readonly _users: UsersManager;
	get users(): UsersManager {
		return this._users;
	}

	updateConfig(config: Config) {
		// 	const prevCfg = this._config;
		// 	this._config = {
		// 		...this.config,
		// 		...config
		// 	};
		// 	if (prevCfg && prevCfg.serverUrl !== this._config.serverUrl) {
		// 		this.api.baseUrl = this.config.serverUrl;
		// 	}
	}
}

let container: ServiceContainer | undefined;

export namespace Container {
	export function initialize(session: CodeStreamSession) {
		container = new ServiceContainer(session);
	}

	export function instance(): ServiceContainer {
		if (container === undefined) {
			debugger;
			const ex = new Error("Container not yet initialized.");
			Logger.error(ex);
			throw ex;
		}

		return container;
	}
}
