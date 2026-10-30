// What each person may press and read (AGENTS.md rule 1). Online, the people the owner lets in hold a role: the
// host refuses every write by a Viewer, and a Member's change or removal of a record the Member did not add. This
// app does not know who added a board or a message, so a Member gets only the presses that add something new: a
// board, or a message on a board that still takes messages, which then waits for review. The owner and Helpers keep
// every press and see everything. An unknown role gets nothing.
const ADDS = Object.freeze(['owner', 'helper', 'member']);
const CHANGES = Object.freeze(['owner', 'helper']);
// The boards each role sees, by status (null: every board). A Viewer sees a board once it is marked ready; a Member
// sees every board that is not archived. There is no per-board membership yet.
const SEEN = Object.freeze({ member: Object.freeze(['draft', 'collecting', 'ready']), viewer: Object.freeze(['ready']) });
// A board takes a Member's message until it is marked ready; ready and archived boards are closed to them.
const OPEN = Object.freeze(['draft', 'collecting']);

export function canAdd(role) { return ADDS.includes(role); }
export function canChange(role) { return CHANGES.includes(role); }
export function abilities(role) { return { canAdd: canAdd(role), canChange: canChange(role) }; }
export const NO_ABILITIES = Object.freeze({ canAdd: false, canChange: false });
/** The board statuses `role` may read, or `null` for all of them. */
export function boardStatusesFor(role) { return canChange(role) ? null : SEEN[role] ?? Object.freeze([]); }
/** Whether a board with this status takes a new message from someone who cannot change it. */
export function takesMessages(status) { return OPEN.includes(status); }
