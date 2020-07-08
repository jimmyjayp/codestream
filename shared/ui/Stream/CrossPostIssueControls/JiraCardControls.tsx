import React from "react";
import Icon from "../Icon";
import Menu from "../Menu";
import AsyncSelect from "react-select/async";
import {
	CodeDelimiterStyles,
	ThirdPartyProviderConfig,
	FetchThirdPartyBoardsRequestType,
	JiraBoard,
	FetchAssignableUsersRequestType
} from "@codestream/protocols/agent";
import { useDispatch, useSelector } from "react-redux";
import { setIssueProvider } from "@codestream/webview/store/context/actions";
import { CodeStreamState } from "@codestream/webview/store";
import { getIntegrationData } from "@codestream/webview/store/activeIntegrations/reducer";
import { JiraIntegrationData } from "@codestream/webview/store/activeIntegrations/types";
import { updateForProvider } from "@codestream/webview/store/activeIntegrations/actions";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "../..";
import { CrossPostIssueContext } from "../CodemarkForm";
import { emptyArray, mapFilter } from "@codestream/webview/utils";
import ReactDOM from "react-dom";
import { disconnectProvider } from "../actions";

export function JiraCardControls(
	props: React.PropsWithChildren<{ provider: ThirdPartyProviderConfig }>
) {
	const dispatch = useDispatch();
	const data = useSelector((state: CodeStreamState) =>
		getIntegrationData<JiraIntegrationData>(state.activeIntegrations, props.provider.id)
	);
	const updateDataState = React.useCallback(
		(data: Partial<JiraIntegrationData>) => {
			dispatch(updateForProvider<JiraIntegrationData>(props.provider.id, data));
		},
		[props.provider.id]
	);

	const crossPostIssueContext = React.useContext(CrossPostIssueContext);

	useDidMount(() => {
		crossPostIssueContext.setValues({
			codeDelimiterStyle: CodeDelimiterStyles.CODE_BRACE
		});
		if (data.projects && data.projects.length > 0 && data.currentProject) {
			const project = data.currentProject || data.projects[0];
			crossPostIssueContext.setValues({
				boardId: project.id,
				issueType: data.currentIssueType || project.issueTypes[0]
			});
			return;
		}
		if (!data.isLoading) {
			updateDataState({
				isLoading: true
			});
		}

		let isValid = true;

		const fetchBoards = async () => {
			let response = await HostApi.instance.send(FetchThirdPartyBoardsRequestType, {
				providerId: props.provider.id
			});

			if (!isValid) return;

			if (response.boards.length === 0) {
				// 💩 retry in case there was a race condition (continues until this component is unmounted)
				await fetchBoards();
				return;
			}
			// make sure to persist current selections if possible
			const newCurrentProject = (data.currentProject
				? response.boards.find(b => b.id === data.currentProject!.id)
				: response.boards[0]) as JiraBoard;

			const newCurrentIssueType = data.currentIssueType
				? newCurrentProject.issueTypes.find(type => type === data.currentIssueType)
				: newCurrentProject.issueTypes[0];

			updateDataState({
				isLoading: false,
				projects: response.boards as JiraBoard[],
				currentProject: newCurrentProject,
				currentIssueType: newCurrentIssueType
			});

			crossPostIssueContext.setValues({
				codeDelimiterStyle: CodeDelimiterStyles.CODE_BRACE,
				issueType: newCurrentIssueType,
				boardId: newCurrentProject.id
			});
		};

		fetchBoards();

		return () => {
			isValid = false;
		};
	});

	const [issueTypeMenuState, setIssueTypeMenuState] = React.useState<{
		open: boolean;
		target?: EventTarget;
	}>({ open: false, target: undefined });

	const [projectMenuState, setProjectMenuState] = React.useState<{
		open: boolean;
		target?: EventTarget;
	}>({ open: false, target: undefined });

	const handleClickIssueType = React.useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		event.persist();
		setIssueTypeMenuState(state => ({ target: event.target, open: !state.open }));
	}, []);

	const selectIssueType = React.useCallback((issueType?: string) => {
		setIssueTypeMenuState({ target: undefined, open: false });
		if (issueType) {
			updateDataState({ currentIssueType: issueType });
			crossPostIssueContext.setValues({
				issueType
			});
		}
	}, []);

	const handleClickProject = React.useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		event.persist();
		setProjectMenuState(state => ({ open: !state.open, target: event.target }));
	}, []);

	const selectProject = React.useCallback((project?: JiraBoard) => {
		setProjectMenuState({ open: false, target: undefined });
		if (project) {
			const boardId = project.id;
			const issueType = project.issueTypes[0];
			updateDataState({ currentProject: project, currentIssueType: issueType });
			crossPostIssueContext.setValues({
				boardId,
				issueType
			});
		}
	}, []);

	const loadAssignableUsers = React.useCallback(
		async (inputValue: string) => {
			if (!data.currentProject) return [];

			try {
				const { users } = await HostApi.instance.send(FetchAssignableUsersRequestType, {
					providerId: props.provider.id,
					boardId: data.currentProject.id
				});
				return mapFilter(users, user => {
					if (user.displayName.toLowerCase().includes(inputValue.toLowerCase()))
						return { label: user.displayName, value: user };
					return;
				});
			} catch (error) {
				// in case auth tokens have expired
				// TODO: needs to be communicated to the user
				dispatch(disconnectProvider(props.provider.id, "Compose Modal"));
				return [];
			}
		},
		[data.currentProject]
	);

	const assigneesInput = (() => {
		if (crossPostIssueContext.assigneesInputTarget == undefined) return null;

		const { currentProject } = data;

		const isDisabled = currentProject && currentProject.assigneesDisabled;
		const isRequired = currentProject && currentProject.assigneesRequired;

		return ReactDOM.createPortal(
			<AsyncSelect
				key={currentProject ? currentProject.id : "no-project"}
				id="input-assignees"
				name="assignees"
				classNamePrefix="react-select"
				defaultOptions
				loadOptions={loadAssignableUsers}
				value={crossPostIssueContext.selectedAssignees}
				isClearable
				placeholder={`Assignee${
					isRequired ? " (required)" : isDisabled ? " (N/A)" : " (optional)"
				}`}
				isDisabled={isDisabled}
				onChange={value => crossPostIssueContext.setSelectedAssignees(value)}
			/>,
			crossPostIssueContext.assigneesInputTarget
		);
	})();

	if (data.isLoading) {
		return (
			<>
				{assigneesInput}
				<span>
					<Icon className="spin" name="sync" /> Syncing projects...
				</span>
				<a
					style={{ marginLeft: "5px" }}
					onClick={e => {
						e.preventDefault();
						dispatch(setIssueProvider(undefined));
						updateDataState({ isLoading: false });
					}}
				>
					cancel
				</a>
			</>
		);
	}

	return (
		<>
			{assigneesInput}
			<div className="checkbox-row">
				<input type="checkbox" checked onChange={_ => dispatch(setIssueProvider(undefined))} />
				{" Add a "}
				<span className="channel-label" onClick={handleClickIssueType}>
					{data.currentIssueType}
					<Icon name="chevron-down" />
					{issueTypeMenuState.open && (
						<Menu
							align="center"
							compact={true}
							target={issueTypeMenuState.target}
							items={
								data.currentProject
									? data.currentProject.issueTypes.map(it => ({ label: it, action: it }))
									: []
							}
							action={selectIssueType}
						/>
					)}
				</span>
				{" on "}
				<span className="channel-label" onClick={handleClickProject}>
					{data.currentProject && data.currentProject.name}
					<Icon name="chevron-down" />
					{projectMenuState.open && (
						<Menu
							align="center"
							compact={true}
							target={projectMenuState.target}
							items={(data.projects || emptyArray).map(project => ({
								key: project.id,
								label: project.name,
								action: project
							}))}
							action={selectProject}
						/>
					)}
				</span>
				{` on `}
				{props.children}
			</div>
		</>
	);
}
