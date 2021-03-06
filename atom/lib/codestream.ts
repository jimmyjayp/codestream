import {
	ChangeDataType,
	CreateDocumentMarkerPermalinkRequestType
} from "@codestream/protocols/agent";
import { CodemarkType } from "@codestream/protocols/api";
import { CompositeDisposable, Disposable } from "atom";
import { FileLogger, LOG_DIR } from "logger";
import { SplitDiffService } from "types/package-services/split-diff";
import { Debug, Echo, Editor, Listener } from "utils";
import { CODESTREAM_VIEW_URI } from "views/codestream-view";
import { Container } from "workspace/container";
import {
	Environment,
	EnvironmentConfig,
	PD_CONFIG,
	PRODUCTION_CONFIG,
	QA_CONFIG
} from "./env-utils";
import { PackageState } from "./types/package";
import { StatusBar } from "./types/package-services/status-bar";
import { SessionStatus } from "./workspace/workspace-session";

class CodestreamPackage {
	subscriptions = new CompositeDisposable();
	sessionStatusCommand?: Disposable;
	loggedInCommandsSubscription?: CompositeDisposable;
	private environmentChangeEmitter = new Echo<EnvironmentConfig>();

	constructor() {
		this.initialize();
	}

	// Package lifecyle 1
	async initialize() {
		const session = Container.session;
		this.subscriptions.add(
			session.observeSessionStatus(status => {
				this.sessionStatusCommand && this.sessionStatusCommand.dispose();
				if (status === SessionStatus.SignedIn) {
					this.registerLoggedInCommands();
					this.sessionStatusCommand = atom.commands.add(
						"atom-workspace",
						"codestream:sign-out",
						async () => {
							Container.viewController.destroyView(CODESTREAM_VIEW_URI);
							await session.signOut();
						}
					);
				}
				if (status === SessionStatus.SignedOut) {
					this.loggedInCommandsSubscription && this.loggedInCommandsSubscription.dispose();
					this.sessionStatusCommand = atom.commands.add(
						"atom-workspace",
						"codestream:sign-in",
						() => {}
					);
				}
			})
		);

		const hiddenInCommandPalette = !atom.inDevMode();
		this.subscriptions.add(
			atom.commands.add("atom-workspace", "codestream:open-logs", () => {
				atom.project.addPath(LOG_DIR);
				atom.notifications.addInfo("The CodeStream log directory has been added to workspace");
			}),
			// 		Dev mode goodies
			atom.commands.add("atom-workspace", "codestream:reload-webview", {
				didDispatch: () => {
					Container.viewController.reload(CODESTREAM_VIEW_URI);
				},
				hiddenInCommandPalette
			}),
			atom.commands.add("atom-workspace", "codestream:point-to-qa", {
				didDispatch: async () => {
					Container.configs.set("serverUrl", QA_CONFIG.serverUrl);
					await session.signOut();
					this.environmentChangeEmitter.push(QA_CONFIG);
					Container.viewController.reload(CODESTREAM_VIEW_URI);
				},
				hiddenInCommandPalette
			}),
			atom.commands.add("atom-workspace", "codestream:point-to-dev", {
				didDispatch: async () => {
					Container.configs.set("serverUrl", PD_CONFIG.serverUrl);
					await session.signOut();
					this.environmentChangeEmitter.push(PD_CONFIG);
					Container.viewController.reload(CODESTREAM_VIEW_URI);
				},
				hiddenInCommandPalette
			}),
			atom.commands.add("atom-workspace", "codestream:point-to-production", {
				didDispatch: async () => {
					Container.configs.set("serverUrl", PRODUCTION_CONFIG.serverUrl);
					await session.signOut();
					this.environmentChangeEmitter.push(PRODUCTION_CONFIG);
					Container.viewController.reload(CODESTREAM_VIEW_URI);
				},
				hiddenInCommandPalette
			})
		);
	}

	// Package lifecyle
	deserializeCodestreamView() {
		return Container.viewController.getMainView();
	}

	// Package lifecyle
	// activate() {}

	handleURI(parsedUri: { href: string }) {
		Container.viewController.handleProtocolRequest(parsedUri.href);
	}

	// Package lifecyle
	serialize(): PackageState {
		return {
			...Container.session.serialize(),
			views: Container.viewController.serialize(),
			debug: Debug.isDebugging()
		};
	}

	// Package lifecyle
	async deactivate() {
		this.environmentChangeEmitter.dispose();
		Container.session.dispose();
		this.subscriptions.dispose();
		this.sessionStatusCommand!.dispose();
		Container.viewController.dispose();
		Container.markerDecorationProvider.dispose();
		Container.styles.dispose();
		Container.editorManipulator.dispose();
		this.loggedInCommandsSubscription && this.loggedInCommandsSubscription.dispose();
		await FileLogger.nuke();
	}

	provideEnvironmentConfig() {
		return {
			get: () => Container.session.environment,
			onDidChange: (cb: Listener<EnvironmentConfig>) => this.environmentChangeEmitter.add(cb)
		};
	}

	provideDebugConfig() {
		return {
			set: (enable: boolean) => {
				Debug.setDebugging(enable);
				atom.reload();
			},
			get: () => Debug.isDebugging()
		};
	}

	private registerLoggedInCommands() {
		const sendNewCodemarkRequest = (type: CodemarkType, entry: "Context Menu" | "Shortcut") => {
			const view = Container.viewController.getMainView();
			view.show().then(() => {
				view.newCodemarkRequest(type, entry);
			});
		};

		const sendStartWorkRequest = (entry: "Context Menu" | "Shortcut") => {
			const view = Container.viewController.getMainView();
			view.show().then(() => {
				view.startWorkRequest(entry);
			});
		};

		this.loggedInCommandsSubscription = new CompositeDisposable(
			// context menu options
			atom.commands.add("atom-workspace", "codestream:context-create-comment", {
				hiddenInCommandPalette: true,
				didDispatch: () => sendNewCodemarkRequest(CodemarkType.Comment, "Context Menu")
			}),
			atom.commands.add("atom-workspace", "codestream:context-create-issue", {
				hiddenInCommandPalette: true,
				didDispatch: () => sendNewCodemarkRequest(CodemarkType.Issue, "Context Menu")
			}),
			atom.commands.add("atom-workspace", "codestream:context-get-permalink", {
				hiddenInCommandPalette: true,
				didDispatch: () => sendNewCodemarkRequest(CodemarkType.Link, "Context Menu")
			}),
			// keymappings
			atom.commands.add("atom-workspace", "codestream:keymap-create-comment", {
				hiddenInCommandPalette: true,
				didDispatch: () => sendNewCodemarkRequest(CodemarkType.Comment, "Shortcut")
			}),
			atom.commands.add("atom-workspace", "codestream:keymap-create-issue", {
				hiddenInCommandPalette: true,
				didDispatch: () => sendNewCodemarkRequest(CodemarkType.Issue, "Shortcut")
			}),
			atom.commands.add("atom-workspace", "codestream:keymap-get-permalink", {
				hiddenInCommandPalette: true,
				didDispatch: () => sendNewCodemarkRequest(CodemarkType.Link, "Shortcut")
			}),
			atom.commands.add("atom-workspace", "codestream:start-work", {
				hiddenInCommandPalette: true,
				didDispatch: () => sendStartWorkRequest("Shortcut")
			}),
			atom.commands.add("atom-workspace", "codestream:keymap-copy-permalink", {
				hiddenInCommandPalette: true,
				didDispatch: async () => {
					const editor = atom.workspace.getActiveTextEditor();
					if (!editor) {
						return;
					}
					const response = await Container.session.agent.request(
						CreateDocumentMarkerPermalinkRequestType,
						{
							uri: Editor.getUri(editor),
							range: Editor.getCurrentSelectionRange(editor),
							privacy: "private"
						}
					);
					atom.clipboard.write(response.linkUrl);
					atom.notifications.addInfo("Permalink copied to clipboard!");
				}
			})
		);
	}

	async consumeStatusBar(statusBar: StatusBar) {
		const createStatusBarTitle = (
			status: SessionStatus,
			unreads?: { totalMentions: number; totalUnreads: number }
		) => {
			const environmentLabel = (() => {
				const env = Container.session.environment.name;
				switch (env) {
					case Environment.PD:
					case Environment.QA:
						return `${env}:`;
					default:
						return "";
				}
			})();
			const unreadsLabel = (() => {
				if (unreads) {
					if (unreads.totalMentions > 0) return `(${unreads.totalMentions})`;
					if (unreads.totalUnreads > 0) return "\u00a0\u2022";
				}
				return "";
			})();

			switch (status) {
				case SessionStatus.SignedIn:
					return `${environmentLabel} ${Container.session.user!.username} ${unreadsLabel}`.trim();
				case SessionStatus.SigningIn:
					return `Signing in...${environmentLabel}`.replace(":", "");
				default:
					return `${environmentLabel} CodeStream`.trim();
			}
		};

		const getStatusBarIconClasses = (
			status: SessionStatus,
			_unreads?: { totalMentions: number }
		) => {
			if (status === SessionStatus.SigningIn) {
				return "icon loading loading-spinner-tiny inline-block".split(" ");
			}
			return "icon icon-comment-discussion".split(" ");
		};

		const tileRoot = document.createElement("div");
		tileRoot.classList.add("inline-block", "codestream-session-status");
		tileRoot.onclick = event => {
			event.stopPropagation();
			atom.commands.dispatch(document.querySelector("atom-workspace")!, "codestream:toggle");
		};
		const icon = document.createElement("span");
		icon.classList.add(...getStatusBarIconClasses(Container.session.status));
		tileRoot.appendChild(icon);
		atom.tooltips.add(tileRoot, { title: "Toggle CodeStream" });
		const text = document.createElement("span");
		tileRoot.appendChild(text);

		const statusBarTile = statusBar.addRightTile({ item: tileRoot, priority: 400 });

		const sessionStatusSubscription = Container.session.observeSessionStatus(status => {
			text.innerText = createStatusBarTitle(status);
			icon.classList.remove(...icon.classList.values());
			icon.classList.add(...getStatusBarIconClasses(Container.session.status));
		});

		this.environmentChangeEmitter.add(() => {
			text.innerText = createStatusBarTitle(Container.session.status);
		});

		const dataChangeSubscription = Container.session.agent.onDidChangeData(event => {
			if (event.type === ChangeDataType.Unreads) {
				text.innerText = createStatusBarTitle(Container.session.status, event.data);
			}
		});

		const statusBarDisposable = new Disposable(() => {
			sessionStatusSubscription.dispose();
			dataChangeSubscription.dispose();
			if (statusBarTile) {
				statusBarTile.destroy();
			}
		});

		this.subscriptions.add(statusBarDisposable);

		return statusBarDisposable;
	}

	consumeSplitDiff(splitDiff: SplitDiffService) {
		Container.diffController.splitDiffService = splitDiff;
		return new Disposable(() => {
			splitDiff.disable();
			Container.diffController.splitDiffService = undefined;
		});
	}
}

let codestream: CodestreamPackage | undefined;
const packageWrapper = {
	// These methods will be favored over the ones in CodestreamPackage and they will delegate accordingly
	initialize(state: PackageState) {
		Container.initialize(state);
		if (Debug.isDebugging()) {
			console.debug("CodeStream package initialized with state:", state);
		}
		codestream = new CodestreamPackage();
	},

	async deactivate() {
		await codestream!.deactivate();
		codestream = undefined;
	}
};

// we need to export default for compatibilit with atom because it expects packages to be commonjs modules
// eslint-disable-next-line import/no-default-export
export default new Proxy(packageWrapper, {
	get(target: any, name: any) {
		if (Reflect.has(target, name)) {
			return target[name];
		}

		if (codestream != null && Reflect.has(codestream, name)) {
			let property = codestream[name];
			if (typeof property === "function") {
				property = property.bind(codestream);
			}
			return property;
		}

		return undefined;
	}
});
