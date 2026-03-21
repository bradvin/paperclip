import type { IssuePriority } from "@paperclipai/shared";

export const AGENT_BENCHMARK_REPO_URL = "https://github.com/bradvin/agent-benchmark";
export const AGENT_BENCHMARK_REPO_REF = "master";

type SmallSetTaskType = "bug" | "feature" | "docs" | "refactor";

type RawBenchmarkTask = {
  id: string;
  title: string;
  type: SmallSetTaskType;
  priority: IssuePriority;
  background: string;
  currentBehavior: string;
  expectedBehavior: string;
  acceptanceCriteria: string[];
  suggestedFiles: string[];
  dependencies: string[];
};

export type AgentBenchmarkTask = Omit<RawBenchmarkTask, "dependencies"> & {
  sourceType: SmallSetTaskType;
  dependencies: string[];
  description: string;
};

export type AgentBenchmarkDependency = {
  from: string;
  to: string;
};

export type AgentBenchmarkSuite = {
  tasks: AgentBenchmarkTask[];
  hardDependencies: AgentBenchmarkDependency[];
};

const SMALL_SET_TASKS: RawBenchmarkTask[] = [
  {
    id: "REF-001",
    title: "Centralize remaining/completed/all-checked state calculation",
    type: "refactor",
    priority: "high",
    background: "Several backlog items touch the same derived footer state and bulk-toggle behavior.",
    currentBehavior: "Counting and bulk-toggle behavior are handled inline in controller watch logic.",
    expectedBehavior:
      "Derived todo state has a single clear source of truth before dependent behavior changes are attempted.",
    acceptanceCriteria: [
      "Computed remaining/completed counts are derived from one normalized list model."
    ],
    suggestedFiles: ["js/controllers/todoCtrl.js"],
    dependencies: [],
  },
  {
    id: "BUG-001",
    title: "Fix the remaining item count",
    type: "bug",
    priority: "high",
    background: "The footer count is one of the clearest correctness issues in the current app.",
    currentBehavior: "The displayed remaining count is lower than the actual number of active items.",
    expectedBehavior: "The footer shows the correct count of active items.",
    acceptanceCriteria: ["One active item shows 1 item left."],
    suggestedFiles: ["js/controllers/todoCtrl.js", "test/unit/todoCtrlSpec.js"],
    dependencies: ["REF-001"],
  },
  {
    id: "FEAT-005",
    title: "Make the item count reflect the current filter view",
    type: "feature",
    priority: "medium",
    background: "The README suggests the footer count may be more useful on a page-by-page basis.",
    currentBehavior: "The count is intended as a global active-item count and is also currently incorrect.",
    expectedBehavior: "After the base counting bug is fixed, the count reflects the chosen filtered view semantics.",
    acceptanceCriteria: ["The selected filter-count behavior is implemented consistently."],
    suggestedFiles: ["js/controllers/todoCtrl.js", "index.html"],
    dependencies: ["REF-001", "BUG-001"],
  },
  {
    id: "REF-002",
    title: "Introduce stable item identity for ordering-related work",
    type: "refactor",
    priority: "high",
    background: "Reordering and prioritization are difficult to evaluate cleanly when items are tracked only by array position.",
    currentBehavior: "The UI repeats todos by array index and does not expose stable ordering semantics.",
    expectedBehavior:
      "Ordering-related tasks can build on a stable item identity or equivalent deterministic ordering mechanism.",
    acceptanceCriteria: ["The refactor creates a clean base for ordering work."],
    suggestedFiles: ["js/controllers/todoCtrl.js"],
    dependencies: [],
  },
  {
    id: "FEAT-001",
    title: "Allow users to reorder todo items",
    type: "feature",
    priority: "high",
    background: "The backlog frames the lack of reordering as missing prioritization capability.",
    currentBehavior: "Items stay in insertion order with no way to reorder them.",
    expectedBehavior: "Users can change item order predictably and that order persists.",
    acceptanceCriteria: ["A user can move an item relative to other items."],
    suggestedFiles: ["index.html", "js/controllers/todoCtrl.js"],
    dependencies: ["REF-002"],
  },
  {
    id: "FEAT-002",
    title: "Add a basic way to prioritize items",
    type: "feature",
    priority: "medium",
    background: "The backlog combines prioritization and reordering as missing functionality.",
    currentBehavior: "Items have no explicit priority model.",
    expectedBehavior: "Users can express priority in a simple, testable way.",
    acceptanceCriteria: ["Priority can be assigned or inferred in a consistent way."],
    suggestedFiles: ["index.html", "js/controllers/todoCtrl.js"],
    dependencies: ["REF-002"],
  },
  {
    id: "DOC-002",
    title: "Document how ordering and priority are intended to work",
    type: "docs",
    priority: "medium",
    background: "If both ordering and prioritization are added, evaluators need a stable description of the final behavior.",
    currentBehavior: "There is no documented ordering or priority model in the baseline repo.",
    expectedBehavior: "Once both ordering tasks are complete, the intended behavior is documented clearly.",
    acceptanceCriteria: ["The final ordering model is described in a way an evaluator can re-test."],
    suggestedFiles: ["readme.md"],
    dependencies: ["FEAT-001", "FEAT-002"],
  },
  {
    id: "BUG-002",
    title: "Fix obvious copy and label inconsistencies",
    type: "bug",
    priority: "low",
    background: "The current UI contains multiple visible copy defects.",
    currentBehavior: "The footer helper text has visible copy errors.",
    expectedBehavior: "Visible labels and helper text are spelled and capitalized consistently.",
    acceptanceCriteria: ["The footer helper text no longer says toodo."],
    suggestedFiles: ["index.html"],
    dependencies: [],
  },
  {
    id: "BUG-003",
    title: "Remove leaked internal placeholder text",
    type: "bug",
    priority: "low",
    background: "The baseline includes internal-looking strings in both markup and source comments.",
    currentBehavior: "The delete button tooltip exposes placeholder text and the HTML contains an inappropriate comment.",
    expectedBehavior: "Internal placeholder text is removed or replaced with intentional product-facing text.",
    acceptanceCriteria: ["The delete button no longer exposes placeholder text."],
    suggestedFiles: ["index.html"],
    dependencies: [],
  },
  {
    id: "BUG-007",
    title: "Reset the new-item input to empty after add",
    type: "bug",
    priority: "medium",
    background: "The current baseline visibly leaves spaces in the new-item field after saving.",
    currentBehavior: "After creating a todo, the input contains spaces instead of being empty.",
    expectedBehavior: "After creating a todo, the input is empty and ready for the next entry.",
    acceptanceCriteria: ["Adding an item clears the field fully."],
    suggestedFiles: ["js/controllers/todoCtrl.js"],
    dependencies: [],
  },
  {
    id: "DOC-003",
    title: "Document the current whitespace normalization rules",
    type: "docs",
    priority: "low",
    background: "The README already notes that input trimming and spacing normalization are observable behaviors.",
    currentBehavior: "Whitespace normalization is noted informally rather than described as a repeatable rule.",
    expectedBehavior:
      "The current normalization behavior is captured clearly for future evaluators.",
    acceptanceCriteria: ["The documentation explains trimming at the start and end."],
    suggestedFiles: ["readme.md"],
    dependencies: [],
  },
  {
    id: "BUG-014",
    title: "Keep the active filter after bulk toggle actions",
    type: "bug",
    priority: "low",
    background: "Users expect filter mode to stay stable when changing completion states in place.",
    currentBehavior: "Toggling all/complete actions can unintentionally switch the list back to the default filter.",
    expectedBehavior: "Filter selection remains unchanged after bulk operations.",
    acceptanceCriteria: ["Selecting Active then toggling completion keeps the Active filter visible."],
    suggestedFiles: ["js/controllers/todoCtrl.js", "js/services/filterService.js"],
    dependencies: [],
  },
  {
    id: "FEAT-010",
    title: "Show clear empty-list messaging",
    type: "feature",
    priority: "low",
    background: "An empty todo list currently offers no explicit guidance for first-time setup.",
    currentBehavior: "The interface shows no contextual cue when there are no items.",
    expectedBehavior: "When list is empty, user sees a clear empty-state message and next action hint.",
    acceptanceCriteria: ["Empty-list state is visually distinct from load error state."],
    suggestedFiles: ["index.html", "css/styles.css"],
    dependencies: [],
  },
  {
    id: "FEAT-011",
    title: "Persist filter and sort mode in client state",
    type: "feature",
    priority: "medium",
    background: "Filter and sort selections reset when the app reloads.",
    currentBehavior: "Reloading reverts to a default list view regardless of user context.",
    expectedBehavior: "Filter and sort preferences are restored from prior session state.",
    acceptanceCriteria: ["Reload retains active filter and ordering mode."],
    suggestedFiles: ["js/controllers/todoCtrl.js", "js/services/statePersistenceService.js"],
    dependencies: ["REF-005"],
  },
  {
    id: "FEAT-013",
    title: "Add inline search filter",
    type: "feature",
    priority: "medium",
    background: "Users with many items struggle to locate specific tasks quickly.",
    currentBehavior: "No free-text filtering exists beyond completion status buckets.",
    expectedBehavior: "A query input narrows visible items by label substring.",
    acceptanceCriteria: ["Search is case-insensitive by default."],
    suggestedFiles: ["index.html", "js/controllers/todoCtrl.js"],
    dependencies: ["FEAT-011"],
  },
];

const SMALL_SET_HARD_DEPENDENCIES: AgentBenchmarkDependency[] = [
  { from: "REF-001", to: "BUG-001" },
  { from: "REF-001", to: "FEAT-005" },
  { from: "REF-002", to: "FEAT-001" },
  { from: "REF-002", to: "FEAT-002" },
  { from: "FEAT-001", to: "DOC-002" },
  { from: "FEAT-002", to: "DOC-002" },
  { from: "FEAT-011", to: "FEAT-013" },
];

function formatTaskDescription(task: RawBenchmarkTask) {
  const lines = [
    `Background:\n${task.background}`,
    `Current Behavior:\n${task.currentBehavior}`,
    `Expected Behavior:\n${task.expectedBehavior}`,
  ];

  if (task.acceptanceCriteria.length > 0) {
    const criteria = task.acceptanceCriteria
      .map((criterion, index) => `${index + 1}. ${criterion}`)
      .join("\n");
    lines.push(`Acceptance Criteria:\n${criteria}`);
  }

  if (task.suggestedFiles.length > 0) {
    const files = task.suggestedFiles.map((file) => `- ${file}`).join("\n");
    lines.push(`Suggested Files:\n${files}`);
  }

  return lines.join("\n\n");
}

export async function loadSmallSetBenchmarkSuite(): Promise<AgentBenchmarkSuite> {
  const tasks = SMALL_SET_TASKS.map((task) => ({
    id: task.id,
    title: task.title,
    sourceType: task.type,
    type: task.type,
    priority: task.priority,
    background: task.background,
    currentBehavior: task.currentBehavior,
    expectedBehavior: task.expectedBehavior,
    acceptanceCriteria: task.acceptanceCriteria,
    dependencies: task.dependencies,
    suggestedFiles: task.suggestedFiles,
    description: formatTaskDescription(task),
  }));

  const taskIds = new Set(tasks.map((task) => task.id));
  const hardDependencies = SMALL_SET_HARD_DEPENDENCIES.filter((dependency) =>
    taskIds.has(dependency.from) && taskIds.has(dependency.to),
  );

  return {
    tasks,
    hardDependencies,
  };
}
