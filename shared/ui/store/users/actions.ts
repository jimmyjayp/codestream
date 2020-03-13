import { CSUser } from "@codestream/protocols/api";
import { action } from "../common";
import { UsersActionsType } from "./types";
import {
	GetRepoScmStatusesRequestType,
	SetModifiedReposRequestType,
	RepoScmStatus
} from "@codestream/protocols/agent";
import { CodeStreamState } from "../../store";
import { HostApi } from "../../webview-api";
import { isFeatureEnabled } from "../apiVersioning/reducer";

export const reset = () => action("RESET");

export const bootstrapUsers = (users: CSUser[]) => action(UsersActionsType.Bootstrap, users);

export const updateUser = (user: CSUser) => action(UsersActionsType.Update, user);

export const addUsers = (users: CSUser[]) => action(UsersActionsType.Add, users);

export const updateModifiedRepos = () => async (dispatch, getState: () => CodeStreamState) => {
	const state = getState();
	const { users, session, context } = state;

	// this neuters
	if (!isFeatureEnabled(state, "xray")) return;

	const userId = session.userId;
	if (!userId) return;
	const currentUser = users[userId];
	if (!currentUser) return;

	const invisible = currentUser.status ? currentUser.status.invisible : false;
	if (invisible) {
		dispatch(clearModifiedFiles(context.currentTeamId));
		return;
	}

	const result = await HostApi.instance.send(GetRepoScmStatusesRequestType, {
		currentUserEmail: currentUser.email
	});
	if (!result.scm) return;

	dispatch(_updateModifiedRepos(result.scm, context.currentTeamId));
};

export const clearModifiedFiles = teamId => _updateModifiedRepos([], teamId);

const _updateModifiedRepos = (modifiedRepos: RepoScmStatus[], teamId: string) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	const response = await HostApi.instance.send(SetModifiedReposRequestType, {
		modifiedRepos,
		teamId
	});
	if (response && response.user) {
		dispatch(updateUser(response.user));
	}
};
