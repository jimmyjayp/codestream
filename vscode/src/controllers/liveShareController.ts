'use strict';
import { commands, Disposable, Extension, extensions, MessageItem, window } from 'vscode';
import { PostsReceivedEvent, User } from '../api/session';
import { ContextKeys, setContext } from '../common';
import { Container } from '../container';

// more 💩 code ahead

const liveShareRegex = /https:\/\/(?:.*?)liveshare(?:.*?).visualstudio.com\/join\?(.*?)(?:\s|$)/;
let liveShare: Extension<any> | undefined;

export class LiveShareController extends Disposable {

    static ensureLiveShare(): boolean {
        if (liveShare === undefined) {
            liveShare = extensions.getExtension('ms-vsliveshare.vsliveshare');
        }
        return liveShare !== undefined;
    }

    private readonly _disposable: Disposable | undefined;

    constructor() {
        super(() => this.dispose());

        if (LiveShareController.ensureLiveShare()) {
            setContext(ContextKeys.LiveShareInstalled, true);
            this._disposable = Disposable.from(
                Container.session.onDidReceivePosts(this.onSessionPostsReceived, this)
            );
        }
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    get liveShareInstalled() {
        return liveShare !== undefined;
    }

    private async onSessionPostsReceived(e: PostsReceivedEvent) {
        const session = Container.session;
        const users = session.users;
        for (const post of e.getPosts()) {
            // if (post.senderId === session.user.id) continue;

            const match = liveShareRegex.exec(post.text);
            if (match != null) {
                const user = await users.get(post.senderId);
                this.onRequestReceived(match[0], user);
            }
        }
    }

    private async onRequestReceived(liveShareId: string, user: User) {
        const actions: MessageItem[] = [
            { title: 'Join Live Share' },
            { title: 'Ignore', isCloseAffordance: true }
        ];

        const result = await window.showInformationMessage(`${user.name} is inviting you to join a Live Share session`, ...actions);
        if (result === undefined || result === actions[1]) return;

        await commands.executeCommand('liveshare.join', liveShareId, { newWindow: true });
        this.openStream(liveShareId, user, Container.session.user);
    }

    async invite(user: User) {
        if (!this.liveShareInstalled) throw new Error('Live Share is not installed');

        const result = await commands.executeCommand('liveshare.start', { suppressNotification: true });
        if (result !== undefined) {
            await Container.session.post(`@${user.name} ${result}`);

            const match = liveShareRegex.exec(result.toString());
            if (match != null) {
                this.openStream(match[1], Container.session.user, user);
            }
        }
    }

    async openStream(liveShareId: string, inviter: User, invitee: User) {
        const stream = await Container.session.directMessages.getOrCreateByName(`vsls://${liveShareId})`, { membership: [ inviter.id, invitee.id ]});
        if (stream === undefined) throw new Error(`Failed to create live share stream`);

        await commands.executeCommand('codestream.openStream', stream);
    }
}