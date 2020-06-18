import { applyPatch, createPatch, parsePatch } from "diff";
import * as paths from "path";
import { TextDocument } from "vscode-languageserver-types";
import { URI } from "vscode-uri";
import { Ranges } from "../api/extensions";
import { GitNumStat } from "../git/models/numstat";
import { Logger } from "../logger";
import {
	BlameAuthor,
	CoAuthors,
	CreateBranchRequest,
	CreateBranchRequestType,
	CreateBranchResponse,
	GetBranchesRequest,
	GetBranchesRequestType,
	GetBranchesResponse,
	GetCommitScmInfoRequest,
	GetCommitScmInfoRequestType,
	GetCommitScmInfoResponse,
	GetFileScmInfoRequest,
	GetFileScmInfoRequestType,
	GetFileScmInfoResponse,
	GetLatestCommittersRequestType,
	GetLatestCommittersResponse,
	GetRangeScmInfoRequest,
	GetRangeScmInfoRequestType,
	GetRangeScmInfoResponse,
	GetRangeSha1Request,
	GetRangeSha1RequestType,
	GetRangeSha1Response,
	GetRepoScmStatusesRequest,
	GetRepoScmStatusesRequestType,
	GetRepoScmStatusesResponse,
	GetRepoScmStatusRequest,
	GetRepoScmStatusRequestType,
	GetRepoScmStatusResponse,
	GetReposScmRequest,
	GetReposScmRequestType,
	GetReposScmResponse,
	RepoScmStatus,
	SwitchBranchRequest,
	SwitchBranchRequestType,
	SwitchBranchResponse
} from "../protocol/agent.protocol";
import { FileStatus } from "../protocol/api.protocol.models";
import { FileSystem, Iterables, log, lsp, lspHandler, Strings } from "../system";
import { xfs } from "../xfs";
import { Container, SessionContainer } from "./../container";
import { IgnoreFilesHelper } from "./ignoreFilesManager";
import { ReviewsManager } from "./reviewsManager";

@lsp
export class ScmManager {
	@lspHandler(GetCommitScmInfoRequestType)
	@log()
	async getCommitInfo({
		revision,
		repoPath,
		repoId
	}: GetCommitScmInfoRequest): Promise<GetCommitScmInfoResponse> {
		const cc = Logger.getCorrelationContext();

		const { git } = SessionContainer.instance();

		if (!repoPath) {
			if (!repoId) {
				const ex = new Error("A repoPath or repoId is required");
				Logger.error(ex, cc);
				throw ex;
			}

			const repo = await git.getRepositoryById(repoId);
			if (repo == null) {
				const ex = new Error(`No repository could be found for repoId=${repoId}`);
				Logger.error(ex, cc);
				throw ex;
			}

			repoPath = repo.path;
		}

		let gitError;
		let commit;
		try {
			if (repoPath !== undefined) {
				commit = await git.getCommit(repoPath, revision);
			}
		} catch (ex) {
			gitError = ex.toString();
			Logger.error(ex, cc);
			debugger;
		}

		return {
			scm:
				commit !== undefined
					? {
							repoPath: commit.repoPath,
							revision: commit.ref,
							message: commit.message,
							shortMessage: commit.shortMessage,
							author: commit.author,
							authorDate: commit.authorDate
							// committerDate: commit.committerDate,
					  }
					: undefined,
			error: gitError
		};
	}

	@lspHandler(GetReposScmRequestType)
	@log()
	async getRepos({}: GetReposScmRequest): Promise<GetReposScmResponse> {
		const cc = Logger.getCorrelationContext();
		let gitError;
		let repositories;
		try {
			const { git } = SessionContainer.instance();
			repositories = Array.from(await git.getRepositories());
		} catch (ex) {
			gitError = ex.toString();
			Logger.error(ex, cc);
			debugger;
		}
		return {
			repositories: repositories
				? repositories.map(_ => {
						return {
							id: _.id,
							path: _.path,
							folder: _.folder,
							root: _.root
						};
				  })
				: undefined,
			error: gitError
		};
	}

	@lspHandler(GetRepoScmStatusesRequestType)
	@log()
	async getRepoStatuses({
		currentUserEmail
	}: GetRepoScmStatusesRequest): Promise<GetRepoScmStatusesResponse> {
		const cc = Logger.getCorrelationContext();
		let gitError;
		let modifiedRepos: RepoScmStatus[] = [];
		try {
			const openRepos = await this.getRepos({});
			const { repositories = [] } = openRepos;
			// below, only return repos that we know about (aka have repoIds)
			// @ts-ignore
			modifiedRepos = (
				await Promise.all(
					repositories
						.filter(r => r.id)
						.map(repo => {
							// TODO make a flavor of getRepoStatus that takes a repo
							const response = this.getRepoStatus({
								uri: Strings.pathToFileURL(repo.path),
								startCommit: "local",
								includeStaged: true,
								includeSaved: true,
								currentUserEmail
							});
							return response;
						})
				)
			)
				.filter(Boolean)
				.filter(r => r.scm && r.scm?.repoId)
				.map(status => {
					return { ...status.scm };
				});
			modifiedRepos.forEach(repo => {
				delete repo.commits;
			});
		} catch (ex) {
			gitError = ex.toString();
			Logger.error(ex, cc);
			debugger;
		}
		return {
			scm: modifiedRepos,
			error: gitError
		};
	}

	@lspHandler(GetBranchesRequestType)
	@log()
	async getBranches({ uri: documentUri }: GetBranchesRequest): Promise<GetBranchesResponse> {
		const cc = Logger.getCorrelationContext();

		const uri = URI.parse(documentUri);
		const { git } = SessionContainer.instance();
		let repoPath = "";
		let result: { branches: string[]; current: string } | undefined = undefined;
		let gitError;

		try {
			repoPath = (await git.getRepoRoot(uri.fsPath)) || "";
			if (repoPath !== undefined) {
				result = await git.getBranches(repoPath);
			}
		} catch (ex) {
			gitError = ex.toString();
			Logger.error(ex, cc);
			debugger;
		}
		return { scm: result || { branches: [], current: "" }, error: gitError };
	}

	@lspHandler(CreateBranchRequestType)
	@log()
	async createBranch({
		uri: documentUri,
		branch
	}: CreateBranchRequest): Promise<CreateBranchResponse> {
		const cc = Logger.getCorrelationContext();

		const uri = URI.parse(documentUri);
		const { git } = SessionContainer.instance();
		let repoPath = "";
		let gitError;

		try {
			repoPath = (await git.getRepoRoot(uri.fsPath)) || "";
			if (repoPath !== undefined) {
				await git.createBranch(repoPath, branch);
			}
		} catch (ex) {
			gitError = ex.toString();
			Logger.error(ex, cc);
			debugger;
		}
		return { scm: { result: gitError ? false : true }, error: gitError };
	}

	@lspHandler(SwitchBranchRequestType)
	@log()
	async switchBranch({
		uri: documentUri,
		branch
	}: SwitchBranchRequest): Promise<SwitchBranchResponse> {
		const cc = Logger.getCorrelationContext();

		const uri = URI.parse(documentUri);
		const { git } = SessionContainer.instance();
		let repoPath = "";
		let gitError;

		try {
			repoPath = (await git.getRepoRoot(uri.fsPath)) || "";
			if (repoPath !== undefined) {
				await git.switchBranch(repoPath, branch);
			}
		} catch (ex) {
			gitError = ex.toString();
			Logger.error(ex, cc);
			debugger;
		}
		return { scm: { result: gitError ? false : true }, error: gitError };
	}

	@lspHandler(GetRepoScmStatusRequestType)
	@log()
	async getRepoStatus(request: GetRepoScmStatusRequest): Promise<GetRepoScmStatusResponse> {
		const cc = Logger.getCorrelationContext();
		let {
			uri: documentUri,
			includeStaged,
			includeSaved,
			startCommit,
			reviewId,
			currentUserEmail
		} = request;

		if (reviewId) {
			return this.getAmendedRepoStatus(request);
		}

		const uri = URI.parse(documentUri);

		let branch: string | undefined;
		let file: string | undefined;
		let stagedFiles: string[] = [];
		let savedFiles: string[] = [];
		let modifiedFiles: {
			oldFile: string;
			file: string;
			linesAdded: number;
			linesRemoved: number;
			status: FileStatus;
			statusX?: FileStatus;
			statusY?: FileStatus;
		}[] = [];
		const authorMap: any = {};
		const authors: CoAuthors[] = [];
		let totalModifiedLines = 0;

		let commits: { sha: string; info: any; localOnly: boolean }[] | undefined;
		let gitError;
		let repoPath = "";
		let repoId;
		let remotes: { name: string; url: string }[] | undefined;
		// this could be a file OR a folder (VSC reports workspace folder paths as file:// uris)
		if (uri.scheme === "file") {
			const { git } = SessionContainer.instance();

			try {
				repoPath = (await git.getRepoRoot(uri.fsPath)) || "";
				if (repoPath !== undefined) {
					file = Strings.normalizePath(paths.relative(repoPath, uri.fsPath));
					if (file[0] === "/") {
						file = file.substr(1);
					}

					branch = await git.getCurrentBranch(uri.fsPath);
					if (branch) commits = await git.getCommitsOnBranch(repoPath, branch);

					const repo = await git.getRepositoryByFilePath(repoPath);
					repoId = repo && repo.id;

					const gitRemotes = await git.getRepoRemotes(repoPath);
					remotes = [...Iterables.map(gitRemotes, r => ({ name: r.name, url: r.normalizedUrl }))];

					// if we don't have a starting point to diff against,
					// assume that we want to diff against either the first
					// commit that isn't mine, or failing that, the parent of
					// the oldest ref, which should be the fork point of this branch
					if (commits && commits.length && !startCommit) {
						const notMine = commits.find(
							commit => commit.info && commit.info.email !== currentUserEmail
						);
						if (notMine) {
							startCommit = notMine.sha;
						} else {
							const oldestSha = commits[commits.length - 1].sha;
							const parentSha = (await git.getParentCommitShas(repoPath, oldestSha))[0];
							if (parentSha) startCommit = parentSha;
							else startCommit = oldestSha + "^";
						}
					}

					// if we only want to show local work, then we should
					// start at the first pushed branch
					if (startCommit === "local") {
						const latestPushed = commits?.find(commit => !commit.localOnly);
						startCommit = latestPushed?.sha;
					}

					if (commits) {
						commits.forEach(commit => {
							// @ts-ignore
							const email = commit.info.email;
							if (email) {
								if (!authorMap[email]) authorMap[email] = { commits: 0, stomped: 0 };
								authorMap[email].commits++;
							}
						});
					}
					modifiedFiles = await git.getNumStat(repoPath, startCommit, includeSaved, includeStaged);
					const ignoreFileHelper = await new IgnoreFilesHelper(repoPath).initialize();

					if (modifiedFiles) {
						modifiedFiles = ignoreFileHelper.filterIgnoredFiles(modifiedFiles, _ => _.file);

						modifiedFiles.forEach(file => {
							totalModifiedLines += file.linesAdded + file.linesRemoved;
						});
					}
					const ret1 = await git.getNumStatSaved(repoPath);
					if (ret1) {
						savedFiles = ret1.map(line => line.file);
					}
					const ret2 = await git.getNumStatStaged(repoPath);
					if (ret2) {
						stagedFiles = ret2.map(line => line.file);
					}
					if (includeSaved || includeStaged) {
						let statusByFile = await git.getStatus(repoPath, includeSaved);
						if (statusByFile) {
							statusByFile = ignoreFileHelper.filterIgnoredFilesByHash(statusByFile);
							if (statusByFile != null) {
								Object.keys(statusByFile).forEach(file => {
									const found = modifiedFiles?.find(line => line.file === file);
									if (found) {
										Object.assign(found, statusByFile![file]);
									} else {
										if (statusByFile![file].status === FileStatus.deleted) {
											modifiedFiles?.unshift({
												oldFile: file,
												file,
												linesAdded: 0,
												linesRemoved: 0,
												...statusByFile![file]
											});
										} else {
											modifiedFiles?.push({
												oldFile: file,
												file,
												linesAdded: 0,
												linesRemoved: 0,
												...statusByFile![file]
											});
										}
									}
								});
							}
						}
					}
					(
						await Promise.all(
							modifiedFiles.map(f => {
								return git.getDiffAuthors(
									repoPath,
									f.file,
									includeSaved,
									includeStaged,
									startCommit
								);
							})
						)
					)
						.filter(Boolean)
						.map(authorList =>
							authorList.forEach(author => {
								if (!authorMap[author.email]) authorMap[author.email] = { stomped: 0, commits: 0 };
								authorMap[author.email].stomped = 1 + authorMap[author.email].stomped;
							})
						);
				}
				Object.keys(authorMap).forEach(email => {
					authors.push({
						email,
						stomped: authorMap[email].stomped,
						commits: authorMap[email].commits
					});
				});
			} catch (ex) {
				gitError = ex.toString();
				Logger.error(ex, cc);
				debugger;
			}
		}

		return {
			uri: uri.toString(),
			scm:
				repoPath !== undefined
					? {
							repoId,
							repoPath,
							branch,
							modifiedFiles: modifiedFiles || [],
							savedFiles,
							stagedFiles,
							startCommit: startCommit || "",
							authors,
							commits: [...(commits || [])],
							remotes: remotes || [],
							totalModifiedLines
					  }
					: undefined,
			error: gitError
		};
	}

	@log()
	async getAmendedRepoStatus({
		uri: documentUri,
		includeStaged,
		includeSaved,
		reviewId
	}: GetRepoScmStatusRequest): Promise<GetRepoScmStatusResponse> {
		const cc = Logger.getCorrelationContext();
		const { git, reviews } = SessionContainer.instance();

		const review = await reviews.getById(reviewId!);
		const uri = URI.parse(documentUri);
		const repoPath = (await git.getRepoRoot(uri.fsPath)) || "";
		const repo = await git.getRepositoryByFilePath(repoPath);
		if (!repo || !repo.id) throw new Error(`Cannot determine repo at ${repoPath}`);
		const branch = await git.getCurrentBranch(repoPath);
		if (!branch) throw new Error(`Cannot determine current branch at ${repoPath}`);
		const gitRemotes = await git.getRepoRemotes(repoPath);
		const remotes = gitRemotes.map(r => ({ name: r.name, url: r.normalizedUrl }));

		const diffs = await reviews.getDiffs(review.id, repo.id);

		const changesets = review.reviewChangesets.filter(cs => cs.repoId === repo.id);

		const modifiedFiles: GitNumStat[] = [];
		const newestCommitInACheckpoint = changesets
			.slice()
			.reverse()
			.find(c => c.commits && c.commits.length)?.commits[0];
		const newestCommitShaInOrBeforeReview =
			newestCommitInACheckpoint?.sha ||
			diffs.find(d => (d.checkpoint || 0) === 0)?.diff.latestCommitSha;
		if (!newestCommitShaInOrBeforeReview) {
			throw new Error("Cannot determine newest commit in or before review");
		}
		const commits = await git.getCommitsOnBranch(repoPath, branch, newestCommitShaInOrBeforeReview);

		const isCommitOnBranch = await git.isCommitOnBranch(
			repoPath,
			branch,
			newestCommitShaInOrBeforeReview
		);
		if (!isCommitOnBranch) {
			// this could happen if this commit was rebased away
			return {
				uri: uri.toString(),
				error: `Commit ${newestCommitShaInOrBeforeReview.substr(
					0,
					8
				)} was not found in branch ${branch}`
			};
		}

		let numStatsFromNewestCommitShaInOrBeforeReview = await git.getNumStat(
			repoPath,
			newestCommitShaInOrBeforeReview,
			includeSaved,
			includeStaged
		);

		const ignoreFileHelper = await new IgnoreFilesHelper(repoPath).initialize();
		if (numStatsFromNewestCommitShaInOrBeforeReview) {
			numStatsFromNewestCommitShaInOrBeforeReview = ignoreFileHelper.filterIgnoredFiles(
				numStatsFromNewestCommitShaInOrBeforeReview,
				_ => _.file
			);
		}
		for (const numStatFromNewestCommitShaInOrBeforeReview of numStatsFromNewestCommitShaInOrBeforeReview) {
			const lastChangesetContainingFile = changesets
				.slice()
				.reverse()
				.find(c =>
					c.modifiedFiles.find(
						mf =>
							mf.file === numStatFromNewestCommitShaInOrBeforeReview.oldFile ||
							mf.file === numStatFromNewestCommitShaInOrBeforeReview.file
					)
				);
			if (lastChangesetContainingFile) {
				// file was included in at least one checkpoint
				const diff = diffs.find(d => d.checkpoint === lastChangesetContainingFile.checkpoint)!.diff;
				const latestCommitToRightDiff = diff.latestCommitToRightDiffs.find(
					d =>
						d.newFileName === numStatFromNewestCommitShaInOrBeforeReview.oldFile ||
						d.newFileName === numStatFromNewestCommitShaInOrBeforeReview.file
				);
				if (latestCommitToRightDiff) {
					// in the last checkpoint where it was included, file had uncommitted changes
					const previousCheckpointLatestCommitContents = await git.getFileContentForRevision(
						paths.join(repoPath, latestCommitToRightDiff.oldFileName!),
						diff.latestCommitSha
					);
					const previousCheckpointRightContents = applyPatch(
						Strings.normalizeFileContents(previousCheckpointLatestCommitContents || ""),
						latestCommitToRightDiff
					);
					const filePath = paths.join(repoPath, numStatFromNewestCommitShaInOrBeforeReview.file);
					const currentContents = includeSaved
						? await xfs.readText(filePath)
						: includeStaged
						? // https://stackoverflow.com/questions/5153199/git-show-content-of-file-as-it-will-look-like-after-committing
						  await git.getFileContentForRevision(filePath, "")
						: await git.getFileContentForRevision(filePath, "HEAD");
					const patch = createPatch(
						numStatFromNewestCommitShaInOrBeforeReview.file,
						Strings.normalizeFileContents(previousCheckpointRightContents),
						Strings.normalizeFileContents(currentContents || ""),
						"",
						""
					);
					const sp = parsePatch(patch)[0];
					let linesAdded = 0;
					let linesRemoved = 0;
					for (const hunk of sp.hunks) {
						for (const line of hunk.lines) {
							const operation = line.charAt(0);
							if (operation === "+") linesAdded++;
							if (operation === "-") linesRemoved++;
						}
					}

					if (linesAdded || linesRemoved) {
						const numStat: GitNumStat = {
							oldFile: latestCommitToRightDiff.newFileName!,
							file: numStatFromNewestCommitShaInOrBeforeReview.file,
							linesAdded,
							linesRemoved,
							status: FileStatus.modified,
							statusX: FileStatus.modified,
							statusY: FileStatus.modified
						};
						modifiedFiles.push(numStat);
					}
				} else {
					// in the last checkpoint where it was included, file had no uncommitted changes
					// TODO cache it
					const numStatsFromLatestCommit = await git.getNumStat(
						repoPath,
						diff.latestCommitSha,
						includeSaved,
						includeStaged
					);
					const numStatFromLatestCommit = numStatsFromLatestCommit.find(
						ns => ns.file === numStatFromNewestCommitShaInOrBeforeReview.file
					);
					if (numStatFromLatestCommit) modifiedFiles.push(numStatFromLatestCommit);
				}
			} else {
				const changesetCheckpoint0 = changesets[0];
				const diffCheckpoint0 = diffs.find(d => d.checkpoint === 0)!.diff;
				const firstCommitShaInReview =
					changesetCheckpoint0.commits[changesetCheckpoint0.commits.length - 1]?.sha;
				const newestCommitShaBeforeFirstCheckpoint = firstCommitShaInReview
					? firstCommitShaInReview + "^"
					: diffCheckpoint0.latestCommitSha;
				const numStatsFromNewestCommitShaBeforeFirstCheckpoint = await git.getNumStat(
					repoPath,
					newestCommitShaBeforeFirstCheckpoint,
					includeSaved,
					includeStaged
				);
				const numStatFromNewestCommitShaBeforeFirstCheckpoint = numStatsFromNewestCommitShaBeforeFirstCheckpoint.find(
					ns => ns.file === numStatFromNewestCommitShaInOrBeforeReview.file
				);
				modifiedFiles.push(numStatFromNewestCommitShaBeforeFirstCheckpoint!);
			}
		}

		let statusByFile = (await git.getStatus(repoPath, includeSaved)) || {};
		statusByFile = ignoreFileHelper.filterIgnoredFilesByHash(statusByFile);
		for (const file of Object.keys(statusByFile)) {
			const status = statusByFile[file];
			// TODO handle previously included deletions
			// TODO handle previously included untracked files that were deleted
			if (status.status !== FileStatus.untracked) {
				continue;
			}

			const lastChangesetContainingFile = changesets
				.slice()
				.reverse()
				.find(c => c.modifiedFiles.find(mf => mf.file === file));
			if (lastChangesetContainingFile) {
				// File  was included in a previous checkpoint, so we need to compute differences rather than listing it as new
				const diff = diffs.find(d => d.checkpoint === lastChangesetContainingFile.checkpoint)!.diff;
				const latestCommitToRightDiff = diff.latestCommitToRightDiffs.find(
					d => d.newFileName === file
				);
				const previousCheckpointRightContents = applyPatch("", latestCommitToRightDiff!);

				const filePath = paths.join(repoPath, file);
				const currentContents = includeSaved
					? await xfs.readText(filePath)
					: includeStaged
					? // https://stackoverflow.com/questions/5153199/git-show-content-of-file-as-it-will-look-like-after-committing
					  await git.getFileContentForRevision(filePath, "")
					: await git.getFileContentForRevision(filePath, "HEAD");
				const patch = createPatch(
					file,
					Strings.normalizeFileContents(previousCheckpointRightContents),
					Strings.normalizeFileContents(currentContents || ""),
					"",
					""
				);
				const sp = parsePatch(patch)[0];
				let linesAdded = 0;
				let linesRemoved = 0;
				for (const hunk of sp.hunks) {
					for (const line of hunk.lines) {
						const operation = line.charAt(0);
						if (operation === "+") linesAdded++;
						if (operation === "-") linesRemoved++;
					}
				}

				if (linesAdded || linesRemoved) {
					const numStat: GitNumStat = {
						oldFile: file,
						file: file,
						linesAdded,
						linesRemoved,
						status: FileStatus.modified,
						statusX: FileStatus.modified,
						statusY: FileStatus.modified
					};
					modifiedFiles.push(numStat);
				}
			} else {
				if (statusByFile[file].status === FileStatus.deleted) {
					modifiedFiles.unshift({
						oldFile: file,
						file,
						linesAdded: 0,
						linesRemoved: 0,
						...statusByFile[file]
					} as GitNumStat);
				} else {
					modifiedFiles.push({
						oldFile: file,
						file,
						linesAdded: 0,
						linesRemoved: 0,
						...statusByFile[file]
					} as GitNumStat);
				}
			}
		}

		const savedFiles = (await git.getNumStatSaved(repoPath)).map(ns => ns.file);
		const stagedFiles = (await git.getNumStatStaged(repoPath)).map(ns => ns.file);

		let totalModifiedLines = 0;
		for (const modifiedFile of modifiedFiles) {
			totalModifiedLines = totalModifiedLines + modifiedFile.linesAdded + modifiedFile.linesRemoved;
		}

		return {
			uri: uri.toString(),
			scm: {
				repoId: repo.id,
				repoPath,
				branch,
				modifiedFiles,
				savedFiles,
				stagedFiles,
				startCommit: newestCommitShaInOrBeforeReview,
				authors: [],
				commits,
				remotes,
				totalModifiedLines
			},
			error: undefined
		};
	}

	@lspHandler(GetFileScmInfoRequestType)
	@log()
	async getFileInfo({ uri: documentUri }: GetFileScmInfoRequest): Promise<GetFileScmInfoResponse> {
		const cc = Logger.getCorrelationContext();

		const uri = URI.parse(documentUri);

		let branch: string | undefined;
		let file: string | undefined;
		let remotes: { name: string; url: string }[] | undefined;
		let rev: string | undefined;

		let gitError;
		let repoPath;
		let repoId;
		if (uri.scheme === "file") {
			const { git } = SessionContainer.instance();

			try {
				repoPath = await git.getRepoRoot(uri.fsPath);
				if (repoPath !== undefined) {
					file = Strings.normalizePath(paths.relative(repoPath, uri.fsPath));
					if (file[0] === "/") {
						file = file.substr(1);
					}

					branch = await git.getCurrentBranch(uri.fsPath);
					try {
						rev = await git.getFileCurrentRevision(uri.fsPath);
					} catch (ex) {
						// this is when we're looking up a directory not a file,
						// getFileCurrentRevision will fail
					}

					const gitRemotes = await git.getRepoRemotes(repoPath);
					remotes = [...Iterables.map(gitRemotes, r => ({ name: r.name, url: r.normalizedUrl }))];

					const repo = await git.getRepositoryByFilePath(repoPath);
					repoId = repo && repo.id;
				}
			} catch (ex) {
				gitError = ex.toString();
				Logger.error(ex, cc);
				debugger;
			}
		}

		return {
			uri: uri.toString(),
			scm:
				repoPath !== undefined
					? {
							file: file!,
							repoPath: repoPath,
							repoId,
							revision: rev!,
							remotes: remotes || [],
							branch
					  }
					: undefined,
			error: gitError
		};
	}

	@lspHandler(GetRangeScmInfoRequestType)
	@log()
	getRangeInfo(request: GetRangeScmInfoRequest): Promise<GetRangeScmInfoResponse> {
		if (request.uri.startsWith("codestream-diff://")) {
			return this.getDiffRangeInfo(request);
		} else {
			return this.getFileRangeInfo(request);
		}
	}

	private async getDiffRangeInfo({
		uri: documentUri,
		range,
		dirty,
		contents,
		skipBlame
	}: GetRangeScmInfoRequest): Promise<GetRangeScmInfoResponse> {
		const { git, reviews } = SessionContainer.instance();
		range = Ranges.ensureStartBeforeEnd(range);

		const { reviewId, checkpoint, repoId, version, path } = ReviewsManager.parseUri(documentUri);
		const repo = await git.getRepositoryById(repoId);
		if (repo == null) throw new Error(`Could not find repo with ID ${repoId}`);

		const uri = URI.parse(documentUri);
		if (contents == null) {
			const reviewContents = await reviews.getContents({ reviewId, repoId, path, checkpoint });
			const versionContents = (reviewContents as any)[version] as string;
			const document = TextDocument.create(uri.toString(), "codestream", 0, versionContents);
			contents = document.getText(range);
		}

		const review = await reviews.getById(reviewId);
		const changeset =
			checkpoint !== undefined
				? review.reviewChangesets.find(c => c.repoId === repoId && c.checkpoint === checkpoint)
				: review.reviewChangesets
						.slice()
						.reverse()
						.find(c => c.repoId === repoId);

		if (!changeset) throw new Error(`Could not find changeset with repoId ${repoId}`);

		const gitRemotes = await repo.getRemotes();
		const remotes = [...Iterables.map(gitRemotes, r => ({ name: r.name, url: r.normalizedUrl }))];
		const diffs = await reviews.getDiffs(reviewId, repoId);
		const checkpointDiff = diffs.find(_ => _.checkpoint === changeset.checkpoint)!;
		return {
			uri: uri.toString(),
			range: range,
			contents: contents!,
			scm: {
				file: path,
				repoPath: repo.path,
				repoId,
				revision: checkpointDiff.diff.latestCommitSha,
				authors: [],
				remotes,
				branch: changeset.branch
			},
			error: undefined
		};
	}

	private async getFileRangeInfo({
		uri: documentUri,
		range,
		dirty,
		contents,
		skipBlame
	}: GetRangeScmInfoRequest): Promise<GetRangeScmInfoResponse> {
		const cc = Logger.getCorrelationContext();
		range = Ranges.ensureStartBeforeEnd(range);
		const uri = URI.parse(documentUri);

		let authors: BlameAuthor[] | undefined;
		let branch: string | undefined;
		let file: string | undefined;
		let remotes: { name: string; url: string }[] | undefined;
		let rev: string | undefined;

		let document;
		if (contents == null) {
			document = Container.instance().documents.get(documentUri);
			if (document === undefined) {
				const ex = new Error(`No document could be found for Uri(${documentUri})`);
				Logger.error(ex, cc);
				throw ex;
			}

			contents = document.getText(range);
		}

		let gitError;
		let repoPath;
		let repoId;
		if (uri.scheme === "file") {
			const { git } = SessionContainer.instance();

			try {
				repoPath = await git.getRepoRoot(uri.fsPath);
				if (repoPath !== undefined) {
					file = Strings.normalizePath(paths.relative(repoPath, uri.fsPath));
					if (file[0] === "/") {
						file = file.substr(1);
					}

					branch = await git.getCurrentBranch(uri.fsPath);
					rev = await git.getFileCurrentRevision(uri.fsPath);
					const repo = await git.getRepositoryByFilePath(uri.fsPath);
					repoId = repo && repo.id;

					const gitRemotes = await git.getRepoRemotes(repoPath);
					remotes = [...Iterables.map(gitRemotes, r => ({ name: r.name, url: r.normalizedUrl }))];

					if (!skipBlame) {
						let blameContents;
						// Only fill out the blame contents if the file is dirty (so we can blame the dirty version)
						if (dirty) {
							if (document === undefined) {
								document = Container.instance().documents.get(documentUri);
								if (document === undefined) {
									const ex = new Error(`No document could be found for Uri(${documentUri})`);
									Logger.error(ex, cc);
									throw ex;
								}
							}

							blameContents = document.getText();
						}

						const gitAuthors = await git.getFileAuthors(uri.fsPath, {
							startLine: range.start.line,
							endLine: range.end.line,
							contents: blameContents,
							retryWithTrimmedEndOnFailure: true
						});
						const authorEmails = gitAuthors.map(a => a.email);

						// const users = await SessionContainer.instance().users.getByEmails(authorEmails);
						// authors = [...Iterables.map(users, u => ({ id: u.id, username: u.username }))];
						authors = await SessionContainer.instance().users.enrichEmailList(authorEmails);
					}
				}
			} catch (ex) {
				gitError = ex.toString();
				Logger.error(ex, cc);
				debugger;
			}
		}

		return {
			uri: uri.toString(),
			range: range,
			contents: contents,
			scm:
				repoPath !== undefined
					? {
							file: file!,
							repoPath: repoPath,
							repoId,
							revision: rev!,
							authors: authors || [],
							remotes: remotes || [],
							branch
					  }
					: undefined,
			error: gitError
		};
	}

	@lspHandler(GetRangeSha1RequestType)
	async getRangeSha1({ uri, range }: GetRangeSha1Request): Promise<GetRangeSha1Response> {
		// Ensure range end is >= start
		range = Ranges.ensureStartBeforeEnd(range);

		const document = Container.instance().documents.get(uri);
		if (document === undefined) {
			try {
				const sha1 = await FileSystem.sha1(URI.parse(uri).fsPath, range);
				return { sha1: sha1 };
			} catch (ex) {
				Logger.error(ex);
				return { sha1: undefined };
			}
		}

		// Normalize to /n line endings
		const content = document.getText(range).replace(/\r\n/g, "\n");
		return { sha1: Strings.sha1(content) };
	}

	@lspHandler(GetLatestCommittersRequestType)
	async getLatestCommittersAllRepos(): Promise<GetLatestCommittersResponse> {
		const cc = Logger.getCorrelationContext();
		const committers: { [email: string]: string } = {};
		const { git } = SessionContainer.instance();
		const since = 60 * 60 * 24 * 60; // two months
		let gitError;
		try {
			const openRepos = await this.getRepos({});
			const { repositories = [] } = openRepos;
			(
				await Promise.all(
					repositories.filter(r => r.id).map(repo => git.getCommittersForRepo(repo.path, since))
				)
			).map(result => {
				Object.keys(result).forEach(key => {
					committers[key] = result[key];
				});
			});
		} catch (ex) {
			gitError = ex.toString();
			Logger.error(ex, cc);
			debugger;
		}

		return {
			scm: committers,
			error: gitError
		};
	}
}