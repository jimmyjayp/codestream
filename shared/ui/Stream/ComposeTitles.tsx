import React from "react";

const modifier = navigator.appVersion.includes("Macintosh") ? "^ /" : "Ctrl-Shift-/";
const ComposeTitles = {
	comment: (
		<span className="compose-title">
			<span className="binding">
				<span className="keybinding extra-pad">{modifier}</span>
				<span className="keybinding">c</span>
			</span>
			<span className="function">Add Comment</span>{" "}
		</span>
	),
	// bookmark: (
	// 	<span>
	// 		<span className="function">Create Bookmark</span>{" "}
	// 		<span className="keybinding extra-pad">{modifier}</span>
	// 		<span className="keybinding">b</span>
	// 	</span>
	// ),
	link: (
		<span className="compose-title">
			<span className="binding">
				<span className="keybinding extra-pad">{modifier}</span>
				<span className="keybinding">p</span>
			</span>
			<span className="function">Get Permalink</span>{" "}
		</span>
	),
	issue: (
		<span className="compose-title">
			<span className="binding">
				<span className="keybinding extra-pad">{modifier}</span>
				<span className="keybinding">i</span>
			</span>
			<span className="function">Create Issue</span>{" "}
		</span>
	),
	review: (
		<span className="compose-title">
			<span className="binding">
				<span className="keybinding extra-pad">{modifier}</span>
				<span className="keybinding">r</span>
			</span>
			<span className="function">Request a Code Review</span>{" "}
		</span>
	),
	about: (
		<span className="compose-title">
			Get Info<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding">a</span>
		</span>
	),
	toggleCodeStreamPanel: (
		<span className="compose-title">
			<span className="binding">
				<span className="keybinding extra-pad">{modifier}</span>
				<span className="keybinding extra-pad">{modifier}</span>
			</span>
			<span className="function">Toggle CodeStream Panel</span>{" "}
		</span>
	),
	privatePermalink: (
		<span className="compose-title">
			<span className="binding">
				<span className="keybinding extra-pad">{modifier}</span>
				<span className="keybinding extra-pad">⇧ p</span>
			</span>
			<span className="function">Copy Private Permalink</span>
		</span>
	)
};

export const ComposeKeybindings = {
	comment: (
		<span className="binding">
			<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding">c</span>
		</span>
	),
	link: (
		<span className="binding">
			<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding">p</span>
		</span>
	),
	issue: (
		<span className="binding">
			<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding">i</span>
		</span>
	),
	review: (
		<span className="binding">
			<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding">r</span>
		</span>
	),
	work: (
		<span className="binding">
			<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding">w</span>
		</span>
	),
	toggleCodeStreamPanel: (
		<span className="binding">
			<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding extra-pad">{modifier}</span>
		</span>
	),
	privatePermalink: (
		<span className="binding">
			<span className="keybinding extra-pad">{modifier}</span>
			<span className="keybinding extra-pad">⇧ p</span>
		</span>
	)
};

export default ComposeTitles;
