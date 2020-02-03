import cx from "classnames";
import { Card, CardBanner, CardBody, CardFooter, CardProps } from "../../src/components/Card";
import { Headshot } from "@codestream/webview/src/components/Headshot";
import { CSUser, CSMarker, CodemarkType, CodemarkStatus } from "@codestream/protocols/api";
import Timestamp from "../Timestamp";
import { useMarkdownifyToHtml } from "../Markdowner";
import Tag from "../Tag";
import Icon from "../Icon";
import { Link } from "../Link";
import { Marker } from "../Marker";
import { CodemarkPlus, OpenUrlRequestType } from "@codestream/protocols/agent";
import { PROVIDER_MAPPINGS } from "../CrossPostIssueControls/types";
import React from "react";
import styled from "styled-components";
import Tooltip from "../Tooltip";
import { HostApi } from "../..";

export interface BaseCodemarkProps extends CardProps {
	codemark: CodemarkPlus;
	author: CSUser;
	collapsed?: boolean;
	isFollowing?: boolean;
	tags?: { id: string }[];
	assignees?: Partial<CSUser>[];
	currentUserEmail?: string;
	providerDisplay?: typeof PROVIDER_MAPPINGS[string];
	relatedCodemarks?: any[];
	pinnedReplies?: any;
	onChangeStatus?(status: CodemarkStatus): void;
	// A menu icon is only displayed if this function returns non-nil
	renderMenu?: (target: any, onClose: () => void) => React.ReactNode;
	// A value of false will hide markers completely. The function can return it's own rendering or null
	renderMarkers?: boolean | ((markers: CSMarker[]) => React.ReactNode);
	// The <CardFooter/> is provided to allow overriding the container style and it must be the returned child
	renderFooter?: (footer: typeof CardFooter) => React.ReactNode;
	renderActions?: boolean;
}

const getCardProps = (props: BaseCodemarkProps) => ({
	onClick: props.onClick,
	hoverEffect: props.hoverEffect,
	className: props.className
});

export function BaseCodemark(props: BaseCodemarkProps) {
	const markdownifyToHtml = useMarkdownifyToHtml();
	const [menuState, setMenuState] = React.useState<{ open: boolean; target?: any }>({
		open: false,
		target: undefined
	});

	const { codemark } = props;

	const hasTags = props.tags && props.tags.length > 0;
	const hasAssignees = props.assignees && props.assignees.length > 0;
	const hasRelatedCodemarks = props.relatedCodemarks && props.relatedCodemarks.length > 0;

	const renderActions = props.renderActions == undefined ? true : props.renderActions;

	const renderedMenu =
		props.renderMenu &&
		menuState.open &&
		props.renderMenu(menuState.target, () => setMenuState({ open: false }));

	const renderedMarkers = (() => {
		if (codemark.markers == undefined || props.renderMarkers === false) return null;

		if (props.renderMarkers == undefined || props.renderMarkers === true)
			return codemark.markers.map(marker => <StyledMarker key={marker.id} marker={marker} />);

		return props.renderMarkers(codemark.markers);
	})();

	const renderedFooter = props.renderFooter ? props.renderFooter(CardFooter) : null;

	return (
		<MinimumWidthCard {...getCardProps(props)}>
			<CardBanner>
				{!codemark.pinned && <div>This codemark is archived.</div>}
				{codemark.status == "closed" && <div>This codemark is resolved.</div>}
			</CardBanner>
			<CardBody>
				<Header>
					<AuthorInfo>
						<Headshot person={props.author} /> {props.author.username}{" "}
						<StyledTimestamp time={codemark.createdAt} />
					</AuthorInfo>
					<HeaderActions>
						{renderActions && codemark.type === CodemarkType.Issue && (
							<ActionButton
								onClick={e => {
									e.preventDefault();
									props.onChangeStatus &&
										props.onChangeStatus(
											codemark.status === CodemarkStatus.Open
												? CodemarkStatus.Closed
												: CodemarkStatus.Open
										);
								}}
							>
								{codemark.status === CodemarkStatus.Closed ? "Reopen" : "Resolve"}
							</ActionButton>
						)}
						{renderedMenu}
						{props.renderMenu && (
							<KebabIcon
								onClickCapture={e => {
									e.preventDefault();
									e.stopPropagation();
									if (menuState.open) {
										setMenuState({ open: false });
									} else {
										setMenuState({ open: true, target: e.currentTarget });
									}
								}}
							>
								<Icon name="kebab-vertical" className="clickable" />
							</KebabIcon>
						)}
					</HeaderActions>
				</Header>
				<Title>
					<Text
						dangerouslySetInnerHTML={{
							__html: markdownifyToHtml(codemark.title || codemark.text)
						}}
					/>
				</Title>
				{!props.collapsed && (
					<>
						<MetaSection>
							{(hasTags || hasAssignees) && (
								<MetaRow>
									{hasTags && (
										<Meta>
											<MetaLabel>Tags</MetaLabel>
											<MetaDescriptionForTags>
												{props.tags!.map(tag => (
													<Tag tag={tag} key={tag.id} />
												))}
											</MetaDescriptionForTags>
										</Meta>
									)}
									{hasAssignees && (
										<Meta>
											<MetaLabel>Assignees</MetaLabel>
											<MetaDescriptionForAssignees>
												{props.assignees!.map(assignee => (
													<MetaAssignee key={assignee.fullName || assignee.email}>
														<Headshot person={assignee as any} size={18} />
														<span
															className={cx({
																"at-mention me":
																	assignee.email != undefined &&
																	assignee.email === props.currentUserEmail
															})}
														>
															{assignee.fullName || assignee.email}
														</span>
													</MetaAssignee>
												))}
											</MetaDescriptionForAssignees>
										</Meta>
									)}
								</MetaRow>
							)}
							{codemark.title && codemark.text && (
								<Meta>
									<MetaLabel>Description</MetaLabel>
									<MetaDescription>
										<Icon name="description" />
										<Text dangerouslySetInnerHTML={{ __html: markdownifyToHtml(codemark.text) }} />
									</MetaDescription>
								</Meta>
							)}
							{props.providerDisplay && (
								<Meta>
									<MetaLabel>Linked Issues</MetaLabel>
									<LinkForExternalUrl href={codemark.externalProviderUrl}>
										<MetaDescription>
											{props.providerDisplay.icon && <Icon name={props.providerDisplay.icon} />}
											<span>{props.providerDisplay.displayName}</span>
											<span style={{ opacity: 0.5 }}>{codemark.externalProviderUrl}</span>
										</MetaDescription>
									</LinkForExternalUrl>
								</Meta>
							)}
							{hasRelatedCodemarks && (
								<Meta>
									<MetaLabel>Related</MetaLabel>
									{props.relatedCodemarks}
								</Meta>
							)}
							{props.pinnedReplies && (
								<Meta>
									<MetaLabel>Starred Replies</MetaLabel>
									{props.pinnedReplies}
								</Meta>
							)}
						</MetaSection>
						{renderedMarkers}
					</>
				)}
				{props.collapsed && (
					<>
						{props.pinnedReplies && (
							<div style={{ marginBottom: "10px" }}>
								<Meta>{props.pinnedReplies}</Meta>
							</div>
						)}
						<MetaSectionCollapsed>
							{props.isFollowing && (
								<span>
									<Icon
										className="detail-icon"
										title="You are following this codemark"
										placement="bottomRight"
										align={{ offset: [22, 4] }}
										name="eye"
									/>
								</span>
							)}
							{hasTags && props.tags!.map(tag => <Tag tag={tag} key={tag.id} />)}
							{hasAssignees &&
								props.assignees!.map((assignee, i) => (
									<Tooltip
										key={i}
										title={`Assigned to ${assignee.fullName || assignee.username}`}
										placement="bottomRight"
										align={{ offset: [17, 4] }}
									>
										<span>
											<Headshot person={assignee as any} size={18} />
										</span>
									</Tooltip>
								))}
							{props.providerDisplay && props.providerDisplay.icon && (
								<span
									className="detail-icon"
									onClickCapture={e => {
										e.preventDefault();
										e.stopPropagation();
										HostApi.instance.send(OpenUrlRequestType, {
											url: codemark.externalProviderUrl!
										});
									}}
								>
									<Icon
										title={"Open on " + props.providerDisplay.displayName}
										placement="bottom"
										name={props.providerDisplay.icon}
									/>
								</span>
							)}
							{codemark.title && codemark.text && (
								<span className="detail-icon">
									<Icon title="Show description" placement="bottom" name="description" />
								</span>
							)}
							{codemark.markers && codemark.markers.length > 1 && (
								<Tooltip title="Multiple code locations" placement="bottom">
									<span className="detail-icon">
										<Icon name="code" /> {codemark.markers.length}
									</span>
								</Tooltip>
							)}
							{hasRelatedCodemarks && (
								<Tooltip title="Show related codemarks" placement="bottom">
									<span className="detail-icon">
										<Icon name="codestream" /> {codemark.relatedCodemarkIds!.length}
									</span>
								</Tooltip>
							)}
							{codemark.numReplies > 0 && (
								<Tooltip title="Show replies" placement="bottom">
									<span className="detail-icon">
										<Icon name="comment" /> {codemark.numReplies}
									</span>
								</Tooltip>
							)}
						</MetaSectionCollapsed>
					</>
				)}
			</CardBody>
			{renderedFooter}
		</MinimumWidthCard>
	);
}

export const MinimumWidthCard = styled(Card)`
	min-width: 200px;
`;

export const Header = styled.div`
	width: 100%;
	margin-bottom: 8px;
	display: flex;
	font-size: 13px;
	font-weight: 700;
`;

export const HeaderActions = styled.div`
	display: flex;
	margin-left: auto;
	justify-content: space-between;
	align-items: center;
`;

export const AuthorInfo = styled.div`
	display: flex;
	align-items: center;
	${Headshot} {
		margin-right: 7px;
	}
`;

export const StyledTimestamp = styled(Timestamp)`
	opacity: 0.4;
	font-size: 11px;
	padding-left: 5px;
	.details {
		padding-left: 5px;
		transition: opacity 0.4s;
	}
`;

export const Title = styled.div`
	margin-bottom: 10px;
`;

export const Text = styled.span`
	white-space: normal;
	text-overflow: initial;
	p {
		margin: 0;
	}
`;

export const Meta = styled.div`
	display: flex;
	flex-direction: column;
	margin-right: auto;
	width: 100%;
`;

export const MetaSection = styled.div`
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	${Meta} {
		padding: 10px 0;
	}
`;

export const MetaSectionCollapsed = styled.div`
	padding: 2px 1px;
	display: flex;
	flex-flow: row wrap;
	align-items: center;
	color: var(--text-color);
	> * {
		margin-right: 10px;
	}

	.detail-icon {
		opacity: 0.4;
		cursor: pointer;
		user-select: none;
		&:hover {
			opacity: 1;
		}
		.icon {
			color: var(--text-color);
		}
	}

	.cs-tag {
		cursor: pointer;
		margin-bottom: 0px;
	}

	${Headshot} {
		cursor: pointer;
		&:hover {
			box-shadow: 0 0 2px white, 0 0 2px white, 0 0 2px white, 0 0 2px white, 0 0 2px white;
		}
	}
`;

const MetaRow = styled.div`
	display: flex;
	flex-flow: row wrap;
	${Meta} {
		width: auto;
	}
`;

export const MetaLabel = styled.div`
	text-transform: uppercase;
	font-weight: 800;
	opacity: 0.5;
	font-size: 11px;
	margin-bottom: 3px;
`;

export const MetaDescription = styled.div`
	display: flex;
	> *:not(:first-child) {
		margin-left: 5px;
	}
`;

const MetaDescriptionForAssignees = styled.div`
	display: flex;
	flex-direction: column;
	> *:not(:last-child) {
		margin-bottom: 5px;
	}
`;

const MetaDescriptionForTags = styled.div`
	display: flex;
	flex-flow: row wrap;
	> *:not(:last-child) {
		margin-right: 5px;
	}
`;

const MetaAssignee = styled.div`
	display: flex;
	${Headshot} {
		margin-right: 5px;
	}
`;

const LinkForExternalUrl = styled(Link)`
	color: var(--text-color);
	text-decoration: none !important;
	&:hover {
		color: var(--text-color-info);
	}
	${MetaDescription} {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
`;

const StyledMarker = styled(Marker)`
	.code {
		margin: 5px 0 !important;
	}
	.file-info {
		font-size: 11px;
		display: flex;
		flex-flow: row wrap;
	}
	.file-info .monospace {
		display: block;
		white-space: nowrap;
	}
	.icon {
		vertical-align: 2px;
	}
`;

export const ActionButton = styled.div`
	border: 1px solid var(--base-border-color);
	padding: 2px 10px;
	cursor: pointer;
	color: var(--text-color);
	&:hover {
		color: var(--button-foreground-color);
		background: var(--button-background-color);
		border: 1px solid var(--button-background-color);
	}
`;

const KebabIcon = styled.span`
	.icon {
		opacity: 0.5;
		margin-left: 2px;
		padding: 0 5px;
	}
`;
