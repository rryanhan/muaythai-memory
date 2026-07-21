const contexts = ["All", "Pad Work", "Bag Work", "Partner Drill", "Clinch", "Technical Work"];

const badgeVersion = "solid-hex-bg-20260616";
const badgePath = (file) => `../assets/context-badges/${file}?v=${badgeVersion}`;
const workoutBadgeVersion = "workout-hex-bg-20260623";
const workoutBadgePath = (file) => `../assets/workout-badges/${file}?v=${workoutBadgeVersion}`;

const contextBadgePaths = {
  "Pad Work": badgePath("pad-work-simple.svg"),
  "Bag Work": badgePath("bag-work-simple.svg"),
  "Partner Drill": badgePath("partner-drill-simple.svg"),
  Clinch: badgePath("clinch-simple.svg"),
  "Technical Work": badgePath("technical-work-simple.svg"),
};

const workoutTypeBadgePaths = {
  Strength: workoutBadgePath("strength-simple.svg"),
  Plyometrics: workoutBadgePath("plyometrics-simple.svg"),
  Conditioning: workoutBadgePath("conditioning-simple.svg"),
  "Mobility & Stretching": workoutBadgePath("mobility-stretching-simple.svg"),
  Isometrics: workoutBadgePath("isometrics-simple.svg"),
  "Core & Stability": workoutBadgePath("core-stability-simple.svg"),
};

const tagGroups = [
  { label: "Boxing", tags: ["Jab", "Cross", "Hook", "Uppercut", "Body Shot"] },
  { label: "Kicking", tags: ["Teep", "Round Kick", "Low Kick", "Shift Kick", "Rear Kick"] },
  { label: "Knees", tags: ["Knee"] },
  { label: "Elbows", tags: ["Elbow"] },
  { label: "Defense", tags: ["Check", "Catch", "Parry", "Shell", "Long Guard"] },
  { label: "Head Movement", tags: ["Slip", "Roll"] },
  { label: "Footwork", tags: ["Pivot", "Step Through", "Stance Switch"] },
  { label: "Sweeps", tags: ["Sweep"] },
  { label: "Training Qualities", tags: ["Entries", "Exits", "Angles", "Distance", "Timing", "Balance", "Pressure", "Rhythm"] },
  { label: "Practice Format", tags: ["Shadowboxing"] },
];

const standardTagNames = new Set(tagGroups.flatMap((group) => group.tags));
const workoutTagFields = [
  { label: "Physical Quality", field: "physicalQualities" },
  { label: "Equipment", field: "equipment" },
  { label: "Body Area", field: "bodyAreas" },
  { label: "Muay Thai Relevance", field: "muayThaiRelevance" },
];
const legacyTagMap = {
  Boxing: [],
  Kicking: [],
  Defense: [],
  "Head Movement": [],
  Footwork: [],
  Counters: [],
  Feints: [],
  Knees: ["Knee"],
  Elbows: ["Elbow"],
  "Stance Switching": ["Stance Switch"],
  Frame: [],
  "Hand Trap": [],
  "Hand Fighting": [],
  "Body Lock": [],
  Dump: [],
};

const profileDemo = {
  name: "Ryan Han",
  initials: "RH",
  journalEntries: [
    {
      date: "Jun 18",
      label: "Pad round",
      caption: "Uppercut timing felt cleaner once the exit step got smaller.",
      drillId: "slip-right-step-through-uppercut-exit",
      method: "Pad Work",
    },
    {
      date: "Jun 15",
      label: "Clinch clip",
      caption: "Still losing posture after hand fighting. Review inside position before next class.",
      drillId: "clinch-hand-fight-to-inside-knee",
      method: "Clinch",
    },
    {
      date: "Jun 11",
      label: "Progress note",
      caption: "Low kick balance is better on the bag, but return to stance is slow.",
      drillId: null,
      method: "Bag Work",
    },
  ],
};

const profileCollectionConfigs = {
  starred: {
    label: "Favourite",
    title: "Favourite Drills",
    status: "Favourite",
  },
  review: {
    label: "To Review",
    title: "Drill Back In",
    status: "Drill Back In",
  },
};

const networkModes = {
  skill: "Skill",
  workout: "Workout",
  bridge: "Bridge",
};

const state = {
  drills: [],
  exercises: [],
  pathways: [],
  workoutTypes: [],
  view: "networkView",
  networkMode: "skill",
  selectedContext: "All",
  libraryQuery: "",
  libraryTagQuery: "",
  activeTags: new Set(),
  activeNetworkTags: new Set(),
  activeWorkoutTags: new Set(),
  networkTagQuery: "",
  workoutTagQuery: "",
  isNetworkTagSelectOpen: false,
  networkSearchTerms: [],
  networkSearchDraft: "",
  isNetworkSearchOpen: false,
  showTrainingTags: false,
  showCustomTags: false,
  showWorkoutTags: false,
  focusedContext: null,
  focusedGraphNode: null,
  focusedGraphLabel: null,
  isLibraryIndexOpen: false,
  libraryDetailDrillId: null,
  profileCollection: null,
};

const els = {};
let networkSimulation = null;

function qs(id) {
  return document.getElementById(id);
}

async function boot() {
  Object.assign(els, {
    networkSvg: qs("networkSvg"),
    networkModeSwitch: qs("networkModeSwitch"),
    stateChips: qs("stateChips"),
    contextTabs: qs("contextTabs"),
    libraryWorkspace: qs("libraryWorkspace"),
    libraryIndexHandle: qs("libraryIndexHandle"),
    libraryIndexBackdrop: qs("libraryIndexBackdrop"),
    libraryIndexDrawer: qs("libraryIndexDrawer"),
    libraryIndexClose: qs("libraryIndexClose"),
    libraryStickyTop: qs("libraryStickyTop"),
    libraryDetailPage: qs("libraryDetailPage"),
    libraryHeaderIcon: qs("libraryHeaderIcon"),
    libraryHeaderTitle: qs("libraryHeaderTitle"),
    libraryHeaderCount: qs("libraryHeaderCount"),
    drillList: qs("drillList"),
    librarySearch: qs("librarySearch"),
    tagFilterButton: qs("tagFilterButton"),
    libraryTagSearch: qs("libraryTagSearch"),
    libraryTagGroupList: qs("libraryTagGroupList"),
    libraryFilterChips: qs("libraryFilterChips"),
    clearLibraryFiltersButton: qs("clearLibraryFiltersButton"),
    controlsButton: qs("controlsButton"),
    searchButton: qs("searchButton"),
    networkSearchInline: qs("networkSearchInline"),
    networkSearchInput: qs("networkSearchInput"),
    captureButton: qs("captureButton"),
    libraryCaptureButton: qs("libraryCaptureButton"),
    sheetBackdrop: qs("sheetBackdrop"),
    controlsSheet: qs("controlsSheet"),
    skillLayerControls: qs("skillLayerControls"),
    skillTagFilterControls: qs("skillTagFilterControls"),
    networkLayerLabel: qs("networkLayerLabel"),
    primaryLayerToggleLabel: qs("primaryLayerToggleLabel"),
    primaryLayerToggleText: qs("primaryLayerToggleText"),
    secondaryLayerToggleLabel: qs("secondaryLayerToggleLabel"),
    secondaryLayerToggleText: qs("secondaryLayerToggleText"),
    networkTagFilterLabel: qs("networkTagFilterLabel"),
    detailSheet: qs("detailSheet"),
    captureSheet: qs("captureSheet"),
    detailTitle: qs("detailTitle"),
    detailContent: qs("detailContent"),
    toggleTrainingTags: qs("toggleTrainingTags"),
    toggleCustomTags: qs("toggleCustomTags"),
    networkTagSearch: qs("networkTagSearch"),
    networkTagSelectButton: qs("networkTagSelectButton"),
    networkTagFilterList: qs("networkTagFilterList"),
    resetNetworkButton: qs("resetNetworkButton"),
    profileMainPage: qs("profileMainPage"),
    profileCollectionPage: qs("profileCollectionPage"),
    profileCollectionBack: qs("profileCollectionBack"),
    profileCollectionLabel: qs("profileCollectionLabel"),
    profileCollectionTitle: qs("profileCollectionTitle"),
    profileCollectionCount: qs("profileCollectionCount"),
    profileCollectionList: qs("profileCollectionList"),
    profileDrillCount: qs("profileDrillCount"),
    profileAvatar: qs("profileAvatar"),
    profileName: qs("profileName"),
    profileStarredList: qs("profileStarredList"),
    profileReviewList: qs("profileReviewList"),
    profileStarredMore: qs("profileStarredMore"),
    profileReviewMore: qs("profileReviewMore"),
    profileJournalList: qs("profileJournalList"),
    profileJournalButton: qs("profileJournalButton"),
    journalDrillSelect: qs("journalDrillSelect"),
  });

  const [drills, workoutData] = await Promise.all([
    fetch("../sample-data/drills.json").then((res) => res.json()),
    fetch("../sample-data/workouts.json").then((res) => res.json()),
  ]);
  state.drills = drills.map(normalizeDrill);
  state.exercises = workoutData.exercises || [];
  state.pathways = workoutData.pathways || workoutData.workouts || [];
  state.workoutTypes = workoutData.workoutTypes || uniqueItems(state.exercises.flatMap((exercise) => exercise.workoutTypes));
  els.profileDrillCount.textContent = state.drills.length;
  bindEvents();
  renderContextTabs();
  renderTagFilters();
  renderNetworkTagFilters();
  renderLibrary();
  renderProfile();
  renderLibraryIndexState();
  renderNetwork();
}

function normalizeDrill(drill) {
  const sourceMethods = drill.trainingMethods ?? drill.contexts ?? [];
  const hadShadowboxingContext = sourceMethods.includes("Shadowboxing");
  const normalizedContexts = sourceMethods.map((context) => {
    if (context === "Sparring Drill") return "Partner Drill";
    if (context === "Shadowboxing") return null;
    if (context === "Warmup") return "Technical Work";
    return context;
  }).filter(Boolean);
  const filteredContexts = [...new Set(normalizedContexts.filter((context) => contexts.includes(context)))];
  if (hadShadowboxingContext && !filteredContexts.length) filteredContexts.push("Technical Work");
  const sourceTrainingTags = hadShadowboxingContext && !drill.trainingTags.includes("Shadowboxing")
    ? [...drill.trainingTags, "Shadowboxing"]
    : drill.trainingTags;
  const normalizedTrainingTags = normalizeTrainingTags(sourceTrainingTags);
  return {
    ...drill,
    contexts: filteredContexts,
    trainingMethods: filteredContexts,
    trainingTags: normalizedTrainingTags,
    coreIdea: drill.coreIdea ?? drill.corePrinciple ?? null,
    status: Array.isArray(drill.status) ? drill.status : [],
    customTags: sourceMethods.includes("Sparring Drill") && !drill.customTags.includes("sparring-focus")
      ? [...drill.customTags, "sparring-focus"]
      : drill.customTags,
  };
}

function normalizeTrainingTags(tags = []) {
  const normalized = [];
  tags.forEach((tag) => {
    const mappedTags = Object.prototype.hasOwnProperty.call(legacyTagMap, tag) ? legacyTagMap[tag] : [tag];
    mappedTags.forEach((mappedTag) => {
      if (mappedTag && !normalized.includes(mappedTag)) normalized.push(mappedTag);
    });
  });
  return normalized;
}

function bindEvents() {
  els.networkModeSwitch.querySelectorAll("[data-network-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.networkMode = button.dataset.networkMode;
      state.focusedContext = null;
      state.focusedGraphNode = null;
      state.focusedGraphLabel = null;
      syncNetworkTagInput();
      renderNetworkTagFilters();
      renderNetwork();
    });
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === state.view));
      document.querySelectorAll(".nav-button").forEach((nav) => nav.classList.toggle("is-active", nav === button));
      if (state.view === "networkView") renderNetwork();
      if (state.view === "libraryView") updateLibraryTopOffset();
      if (state.view === "profileView") renderProfile();
    });
  });

  els.librarySearch.addEventListener("input", (event) => {
    state.libraryQuery = event.target.value.trim().toLowerCase();
    renderLibrary();
  });

  els.libraryIndexHandle.addEventListener("click", openLibraryIndex);
  els.libraryIndexBackdrop.addEventListener("click", closeLibraryIndex);
  els.libraryIndexClose.addEventListener("click", closeLibraryIndex);
  bindLibrarySwipe();

  els.tagFilterButton.addEventListener("click", () => openSheet("libraryFilterSheet"));
  els.libraryTagSearch.addEventListener("input", (event) => {
    state.libraryTagQuery = event.target.value.trim().toLowerCase();
    renderTagFilters();
  });
  els.clearLibraryFiltersButton.addEventListener("click", () => {
    state.activeTags.clear();
    state.libraryTagQuery = "";
    els.libraryTagSearch.value = "";
    renderTagFilters();
    renderLibrary();
  });
  els.controlsButton.addEventListener("click", () => openSheet("controlsSheet"));
  els.networkTagSelectButton.addEventListener("click", () => {
    state.isNetworkTagSelectOpen = !state.isNetworkTagSelectOpen;
    renderNetworkTagFilters();
  });
  els.networkTagSearch.addEventListener("input", (event) => {
    if (state.networkMode === "skill") {
      state.networkTagQuery = event.target.value.trim().toLowerCase();
    } else {
      state.workoutTagQuery = event.target.value.trim().toLowerCase();
    }
    state.isNetworkTagSelectOpen = true;
    renderNetworkTagFilters();
  });
  els.searchButton.addEventListener("click", handleNetworkSearchButton);
  els.networkSearchInput.addEventListener("input", (event) => {
    state.networkSearchDraft = event.target.value.trim().toLowerCase();
    renderNetwork();
  });
  els.networkSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      state.networkSearchDraft = "";
      state.isNetworkSearchOpen = false;
      els.networkSearchInput.value = "";
      renderNetwork();
    }
  });
  els.captureButton.addEventListener("click", () => openSheet("captureSheet"));
  els.libraryCaptureButton.addEventListener("click", () => {
    closeLibraryIndex();
    openSheet("captureSheet");
  });
  els.profileJournalButton.addEventListener("click", () => openSheet("journalSheet"));
  els.profileStarredMore.addEventListener("click", () => openProfileCollection("starred"));
  els.profileReviewMore.addEventListener("click", () => openProfileCollection("review"));
  els.profileCollectionBack.addEventListener("click", closeProfileCollection);

  els.toggleTrainingTags.addEventListener("change", (event) => {
    if (state.networkMode === "skill") {
      state.showTrainingTags = event.target.checked;
    } else if (state.networkMode === "workout") {
      state.showWorkoutTags = event.target.checked;
    }
    renderNetwork();
  });

  els.toggleCustomTags.addEventListener("change", (event) => {
    if (state.networkMode !== "skill") return;
    state.showCustomTags = event.target.checked;
    renderNetwork();
  });

  els.resetNetworkButton.addEventListener("click", () => {
    state.networkSearchTerms = [];
    state.networkSearchDraft = "";
    state.isNetworkSearchOpen = false;
    state.showTrainingTags = false;
    state.showCustomTags = false;
    state.showWorkoutTags = false;
    state.activeNetworkTags.clear();
    state.activeWorkoutTags.clear();
    state.networkTagQuery = "";
    state.workoutTagQuery = "";
    state.isNetworkTagSelectOpen = false;
    state.focusedContext = null;
    state.focusedGraphNode = null;
    state.focusedGraphLabel = null;
    els.networkSearchInput.value = "";
    els.networkTagSearch.value = "";
    els.toggleTrainingTags.checked = false;
    els.toggleCustomTags.checked = false;
    renderNetworkTagFilters();
    closeSheets();
    renderNetwork();
  });

  els.sheetBackdrop.addEventListener("click", closeSheets);
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closeSheets));
}

function handleNetworkSearchButton() {
  if (!state.isNetworkSearchOpen) {
    state.isNetworkSearchOpen = true;
    renderSearchControls();
    window.setTimeout(() => els.networkSearchInput.focus(), 0);
    return;
  }

  const term = state.networkSearchDraft.trim().toLowerCase();
  const shouldCommit = Boolean(term && !state.networkSearchTerms.includes(term));
  if (shouldCommit) {
    state.networkSearchTerms.push(term);
  }

  state.networkSearchDraft = "";
  state.isNetworkSearchOpen = false;
  els.networkSearchInput.value = "";
  renderSearchControls();
  renderNetwork();
}

function activeNetworkSearchTerms() {
  const draft = state.networkSearchDraft.trim().toLowerCase();
  const terms = [...state.networkSearchTerms];
  if (draft && !terms.includes(draft)) terms.push(draft);
  return terms;
}

function drillMatchesSelectedTags(drill, selectedTags) {
  if (!selectedTags.length) return true;
  return selectedTags.every((tag) => drill.trainingTags.includes(tag));
}

function drillSearchText(drill) {
  return [
    drill.title,
    drill.summary,
    ...(drill.contexts || []),
    ...(drill.trainingTags || []),
    ...(drill.customTags || []),
    ...(drill.status || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function drillMatchesNetworkSearch(drill, terms) {
  if (!terms.length) return true;
  const text = drillSearchText(drill);
  return terms.every((term) => text.includes(term));
}

function currentNetworkFilters() {
  const searchTerms = activeNetworkSearchTerms();
  const selectedTags = [...state.activeNetworkTags];
  return {
    searchTerms,
    selectedTags,
    focusContext: state.focusedContext,
    hasSearch: searchTerms.length > 0,
    hasTagFilter: selectedTags.length > 0,
    hasFocus: Boolean(state.focusedContext),
    hasActiveFilters: searchTerms.length > 0 || selectedTags.length > 0 || Boolean(state.focusedContext),
  };
}

function drillMatchesNetworkFilters(drill, filters = currentNetworkFilters()) {
  const focusOk = !filters.focusContext || drill.contexts.includes(filters.focusContext);
  const tagOk = drillMatchesSelectedTags(drill, filters.selectedTags);
  const searchOk = drillMatchesNetworkSearch(drill, filters.searchTerms);
  return focusOk && tagOk && searchOk;
}

function matchingNetworkDrills(filters = currentNetworkFilters()) {
  return state.drills.filter((drill) => drillMatchesNetworkFilters(drill, filters));
}

function focusChipLabel(context) {
  const total = state.drills.filter((drill) => drill.contexts.includes(context)).length;
  const filters = currentNetworkFilters();
  const otherFilters = {
    ...filters,
    focusContext: context,
    hasFocus: true,
    hasActiveFilters: true,
  };
  const matching = matchingNetworkDrills(otherFilters).length;
  const hasNarrowingFilter = filters.hasSearch || filters.hasTagFilter;
  return hasNarrowingFilter ? `Focus: ${context} (${matching}/${total})` : `Focus: ${context} (${total})`;
}

function exerciseMatchesWorkoutSearch(exercise, searchTerms = activeNetworkSearchTerms()) {
  if (!searchTerms.length) return true;
  const text = exerciseSearchText(exercise);
  if (searchTerms.every((term) => text.includes(term))) return true;
  return matchingPathways(searchTerms).some((pathway) => (pathway.exerciseIds || []).includes(exercise.id));
}

function exercisesForPhysicalFocus(focusId) {
  if (!focusId) return state.exercises;
  if (focusId.startsWith("workoutType:")) {
    const typeName = focusId.slice("workoutType:".length);
    return state.exercises.filter((exercise) => (exercise.workoutTypes || []).includes(typeName));
  }
  if (focusId.startsWith("workoutTag:")) {
    const tag = workoutTagNodeLabel(focusId);
    return state.exercises.filter((exercise) => workoutTagsForExercise(exercise).includes(tag));
  }
  if (focusId.startsWith("relevance:")) {
    const relevance = focusId.slice("relevance:".length);
    return state.exercises.filter((exercise) => (exercise.muayThaiRelevance || []).includes(relevance));
  }
  const exercise = exerciseById(focusId);
  return exercise ? [exercise] : [];
}

function physicalFocusChipLabel(focusId, fallbackLabel) {
  const totalExercises = exercisesForPhysicalFocus(focusId);
  const matching = totalExercises.filter((exercise) => (
    exerciseMatchesWorkoutTags(exercise, [...state.activeWorkoutTags])
    && exerciseMatchesWorkoutSearch(exercise)
  ));
  const hasNarrowingFilter = state.activeWorkoutTags.size > 0 || activeNetworkSearchTerms().length > 0;
  return hasNarrowingFilter
    ? `Focus: ${fallbackLabel} (${matching.length}/${totalExercises.length})`
    : `Focus: ${fallbackLabel} (${totalExercises.length})`;
}

function renderSearchControls() {
  els.networkSearchInline.classList.toggle("is-open", state.isNetworkSearchOpen);
  els.searchButton.classList.toggle("is-active", state.isNetworkSearchOpen || state.networkSearchTerms.length > 0);
  if (els.networkSearchInput.value !== state.networkSearchDraft) {
    els.networkSearchInput.value = state.networkSearchDraft;
  }
}

function openSheet(id) {
  const hadSearchPreview = state.networkSearchDraft || state.isNetworkSearchOpen;
  state.networkSearchDraft = "";
  state.isNetworkSearchOpen = false;
  els.networkSearchInput.value = "";
  renderSearchControls();
  if (hadSearchPreview) renderNetwork();
  closeSheets();
  els.sheetBackdrop.classList.add("is-open");
  qs(id).classList.add("is-open");
}

function closeSheets() {
  els.sheetBackdrop.classList.remove("is-open");
  document.querySelectorAll(".bottom-sheet").forEach((sheet) => sheet.classList.remove("is-open"));
}

function openLibraryIndex() {
  state.isLibraryIndexOpen = true;
  renderLibraryIndexState();
}

function closeLibraryIndex() {
  state.isLibraryIndexOpen = false;
  renderLibraryIndexState();
}

function renderLibraryIndexState() {
  els.libraryWorkspace.classList.toggle("is-index-open", state.isLibraryIndexOpen);
  els.libraryIndexHandle.setAttribute("aria-expanded", String(state.isLibraryIndexOpen));
  els.libraryIndexDrawer.setAttribute("aria-hidden", String(!state.isLibraryIndexOpen));
}

function bindLibrarySwipe() {
  let swipeStart = null;

  els.libraryWorkspace.addEventListener("pointerdown", (event) => {
    if (state.view !== "libraryView" || state.isLibraryIndexOpen || event.clientX > 28) return;
    swipeStart = { x: event.clientX, y: event.clientY };
  });

  els.libraryWorkspace.addEventListener("pointerup", (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = Math.abs(event.clientY - swipeStart.y);
    swipeStart = null;
    if (dx > 42 && dy < 48) openLibraryIndex();
  });

  els.libraryWorkspace.addEventListener("pointercancel", () => {
    swipeStart = null;
  });
}

function renderContextTabs() {
  els.contextTabs.innerHTML = "";
  contexts.filter((context) => context !== "All").forEach((context) => {
    const button = document.createElement("button");
    const isActive = state.selectedContext === context;
    button.className = `library-index-item ${isActive ? "is-active" : ""}`;
    button.type = "button";
    button.title = context;
    button.setAttribute("aria-label", isActive ? `Clear ${context} filter` : `Show ${context} drills`);
    button.innerHTML = `
      <img src="${contextBadgePaths[context]}" alt="" />
      <span>${context}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedContext = isActive ? "All" : context;
      renderContextTabs();
      renderLibrary();
      closeLibraryIndex();
    });
    els.contextTabs.append(button);
  });
}

function allStandardTags() {
  const tags = new Set();
  state.drills.forEach((drill) => {
    drill.trainingTags.forEach((tag) => tags.add(tag));
  });
  return [...tags].sort();
}

function allWorkoutTagsByGroup() {
  return workoutTagFields.map((group) => ({
    label: group.label,
    tags: uniqueItems(state.exercises.flatMap((exercise) => exercise[group.field] || [])).sort(),
  })).filter((group) => group.tags.length);
}

function workoutTagsForExercise(exercise) {
  return workoutTagFields.flatMap((group) => exercise[group.field] || []);
}

function workoutTagNodeId(tag) {
  return `workoutTag:${tag}`;
}

function workoutTagNodeType(tag) {
  const owner = workoutTagFields.find((group) => state.exercises.some((exercise) => (exercise[group.field] || []).includes(tag)));
  if (!owner) return "workoutTag";
  if (owner.label === "Physical Quality") return "physicalQuality";
  if (owner.label === "Equipment") return "equipmentTag";
  if (owner.label === "Body Area") return "bodyArea";
  if (owner.label === "Muay Thai Relevance") return "workoutRelevance";
  return "workoutTag";
}

function workoutTagNodeLabel(id) {
  return id.startsWith("workoutTag:") ? id.slice("workoutTag:".length) : id;
}

function exerciseMatchesWorkoutTags(exercise, selectedTags) {
  if (!selectedTags.length) return true;
  const tags = workoutTagsForExercise(exercise);
  return selectedTags.every((tag) => tags.includes(tag));
}

function primaryVisibleWorkoutTags(exercise) {
  return uniqueItems([
    ...(exercise.physicalQualities || []).slice(0, 1),
    ...(exercise.muayThaiRelevance || []).slice(0, 1),
  ]);
}

function visibleWorkoutTagsForExercise(exercise) {
  const visibleTags = state.showWorkoutTags ? primaryVisibleWorkoutTags(exercise) : [];
  state.activeWorkoutTags.forEach((tag) => {
    if (workoutTagsForExercise(exercise).includes(tag) && !visibleTags.includes(tag)) visibleTags.push(tag);
  });
  return visibleTags;
}

function groupedWorkoutTags(query, activeTagSet) {
  const exactGroupMatch = workoutTagFields.some((group) => group.label.toLowerCase() === query);
  return allWorkoutTagsByGroup().map((group) => ({
    ...group,
    tags: group.tags.filter((tag) => {
      const groupMatchesQuery = query && group.label.toLowerCase().includes(query);
      const matchesQuery = !query || groupMatchesQuery || (!exactGroupMatch && tag.toLowerCase().includes(query));
      return matchesQuery || activeTagSet.has(tag);
    }),
  })).filter((group) => group.tags.length);
}

function groupedStandardTags(query, activeTagSet) {
  const usedTags = new Set(allStandardTags());
  const exactGroupMatch = tagGroups.some((group) => group.label.toLowerCase() === query);
  const groupedTags = tagGroups.map((group) => ({
    ...group,
    tags: group.tags.filter((tag) => {
      const groupMatchesQuery = query && group.label.toLowerCase().includes(query);
      const isUseful = usedTags.has(tag) || activeTagSet.has(tag);
      const matchesQuery = !query || groupMatchesQuery || (!exactGroupMatch && tag.toLowerCase().includes(query));
      return isUseful && matchesQuery;
    }),
  })).filter((group) => group.tags.length);

  const otherTags = [...usedTags].filter((tag) => !standardTagNames.has(tag) && (!query || tag.toLowerCase().includes(query)));
  if (otherTags.length) groupedTags.push({ label: "Other", tags: otherTags.sort() });
  return groupedTags;
}

function groupedNetworkTags() {
  if (state.networkMode === "skill") return groupedStandardTags(state.networkTagQuery, state.activeNetworkTags);
  return groupedWorkoutTags(state.workoutTagQuery, state.activeWorkoutTags);
}

function groupedLibraryTags() {
  return groupedStandardTags(state.libraryTagQuery, state.activeTags);
}

function toggleNetworkTag(tag) {
  const activeSet = state.networkMode === "skill" ? state.activeNetworkTags : state.activeWorkoutTags;
  activeSet.has(tag) ? activeSet.delete(tag) : activeSet.add(tag);
  renderNetworkTagFilters();
  renderNetwork();
}

function toggleLibraryTag(tag) {
  state.activeTags.has(tag) ? state.activeTags.delete(tag) : state.activeTags.add(tag);
  renderTagFilters();
  renderLibrary();
}

function renderTagFilters() {
  els.tagFilterButton.classList.toggle("is-active", state.activeTags.size > 0);
  els.clearLibraryFiltersButton.disabled = !state.activeTags.size && !state.libraryTagQuery;

  els.libraryFilterChips.innerHTML = "";
  state.activeTags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "chip is-accent";
    chip.innerHTML = `${tag} <button aria-label="Clear ${tag}">x</button>`;
    chip.querySelector("button").addEventListener("click", () => toggleLibraryTag(tag));
    els.libraryFilterChips.append(chip);
  });

  els.libraryTagGroupList.innerHTML = "";
  const groups = groupedLibraryTags();
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = [
      "network-tag-group",
      group.tags.length > 4 ? "is-wide" : "",
    ].filter(Boolean).join(" ");
    const heading = document.createElement("h3");
    heading.className = "network-tag-group-heading";
    heading.textContent = group.label;
    section.append(heading);

    const body = document.createElement("div");
    body.className = "network-tag-group-body";
    group.tags.forEach((tag) => {
      const button = document.createElement("button");
      button.className = `network-tag-option ${state.activeTags.has(tag) ? "is-active" : ""}`;
      button.type = "button";
      button.textContent = tag;
      button.addEventListener("click", () => toggleLibraryTag(tag));
      body.append(button);
    });
    section.append(body);
    els.libraryTagGroupList.append(section);
  });

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "network-tag-empty";
    empty.textContent = "No matching tags";
    els.libraryTagGroupList.append(empty);
  }
}

function renderNetworkTagFilters() {
  syncNetworkTagInput();
  const groups = groupedNetworkTags();
  const activeSet = state.networkMode === "skill" ? state.activeNetworkTags : state.activeWorkoutTags;
  els.networkTagFilterList.hidden = !state.isNetworkTagSelectOpen;
  els.networkTagFilterList.classList.toggle("is-open", state.isNetworkTagSelectOpen);
  els.networkTagSelectButton.classList.toggle("is-active", activeSet.size > 0 || state.isNetworkTagSelectOpen);
  els.networkTagSelectButton.setAttribute("aria-expanded", String(state.isNetworkTagSelectOpen));
  els.networkTagSelectButton.querySelector("span").textContent = activeSet.size
    ? `${activeSet.size} tag${activeSet.size === 1 ? "" : "s"} selected`
    : "Select tags";
  els.networkTagFilterList.innerHTML = "";

  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = [
      "network-tag-group",
      group.tags.length > 4 ? "is-wide" : "",
    ].filter(Boolean).join(" ");
    const heading = document.createElement("h3");
    heading.className = "network-tag-group-heading";
    heading.textContent = group.label;
    section.append(heading);

    const body = document.createElement("div");
    body.className = "network-tag-group-body";
    group.tags.forEach((tag) => {
      const button = document.createElement("button");
      button.className = `network-tag-option ${activeSet.has(tag) ? "is-active" : ""}`;
      button.type = "button";
      button.textContent = tag;
      button.addEventListener("click", () => toggleNetworkTag(tag));
      body.append(button);
    });
    section.append(body);

    els.networkTagFilterList.append(section);
  });

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "network-tag-empty";
    empty.textContent = "No matching tags";
    els.networkTagFilterList.append(empty);
  }
}

function filteredDrills() {
  return state.drills.filter((drill) => {
    const contextOk = state.selectedContext === "All" || drill.contexts.includes(state.selectedContext);
    const queryOk = !state.libraryQuery || drillSearchText(drill).includes(state.libraryQuery);
    const tagOk = drillMatchesSelectedTags(drill, [...state.activeTags]);
    return contextOk && queryOk && tagOk;
  });
}

function renderLibrary() {
  const drills = filteredDrills();
  renderLibraryHeader(drills.length);
  updateLibraryTopOffset();
  renderLibraryMode();
  els.drillList.innerHTML = "";
  if (!drills.length) {
    const empty = document.createElement("article");
    empty.className = "empty-drill-state";
    empty.innerHTML = `
      <strong>No matching drills</strong>
      <span>Clear a filter or try a different keyword.</span>
    `;
    els.drillList.append(empty);
    return;
  }
  drills.forEach((drill) => {
    const row = document.createElement("button");
    const visibleTags = [
      ...drill.trainingTags,
      ...drill.customTags,
    ].slice(0, 4);
    row.className = "drill-row";
    row.innerHTML = `
      <strong>${drill.title}</strong>
      <div class="meta drill-tag-line">${visibleTags.map((tag) => `<span>${tag}</span>`).join(" ")}</div>
    `;
    row.addEventListener("click", () => openLibraryDrillPage(drill));
    els.drillList.append(row);
  });
}

function drillById(id) {
  return state.drills.find((drill) => drill.id === id);
}

function drillsWithStatus(status) {
  return state.drills.filter((drill) => drill.status.includes(status));
}

function renderProfile() {
  const starredDrills = drillsWithStatus(profileCollectionConfigs.starred.status);
  const reviewDrills = drillsWithStatus(profileCollectionConfigs.review.status);
  els.profileName.textContent = profileDemo.name;
  els.profileAvatar.textContent = profileDemo.initials;
  els.profileDrillCount.textContent = state.drills.length;

  renderProfileDrillList(els.profileStarredList, starredDrills.slice(0, 3));
  renderProfileDrillList(els.profileReviewList, reviewDrills.slice(0, 3));
  renderProfileJournal();
  renderJournalDrillOptions();
  if (state.profileCollection) renderProfileCollectionPage();
  renderProfileMode();
}

function renderProfileMode() {
  const isCollectionOpen = Boolean(state.profileCollection);
  els.profileMainPage.hidden = isCollectionOpen;
  els.profileCollectionPage.hidden = !isCollectionOpen;
}

function openProfileCollection(collectionKey) {
  state.profileCollection = collectionKey;
  renderProfileCollectionPage();
  renderProfileMode();
  window.scrollTo(0, 0);
}

function closeProfileCollection() {
  state.profileCollection = null;
  renderProfileMode();
}

function renderProfileCollectionPage() {
  const config = profileCollectionConfigs[state.profileCollection];
  if (!config) return;
  const drills = drillsWithStatus(config.status);
  els.profileCollectionLabel.textContent = config.label;
  els.profileCollectionTitle.textContent = config.title;
  els.profileCollectionCount.textContent = `${drills.length} drill${drills.length === 1 ? "" : "s"}`;
  renderProfileDrillList(els.profileCollectionList, drills);
}

function renderProfileDrillList(container, drillsOrIds, iconName) {
  container.innerHTML = "";
  drillsOrIds.map((item) => (typeof item === "string" ? drillById(item) : item)).filter(Boolean).forEach((drill) => {
    const primaryContext = drill.contexts[0];
    const row = document.createElement("button");
    row.className = "profile-drill-row";
    if (iconName) row.classList.add("has-trailing-icon");
    row.type = "button";
    row.innerHTML = `
      <img src="${contextBadgePaths[primaryContext]}" alt="" />
      <span>
        <strong>${drill.title}</strong>
        <small class="drill-tag-line">${drill.trainingTags.slice(0, 3).map((tag) => `<span>${tag}</span>`).join(" ")}</small>
      </span>
      ${iconName ? `<i class="ph ph-${iconName}" aria-hidden="true"></i>` : ""}
    `;
    row.addEventListener("click", () => showDrillDetail(drill));
    container.append(row);
  });
}

function renderProfileJournal() {
  els.profileJournalList.innerHTML = "";
  profileDemo.journalEntries.forEach((entry) => {
    const drill = entry.drillId ? drillById(entry.drillId) : null;
    const article = document.createElement("article");
    article.className = "journal-entry";
    article.innerHTML = `
      <div class="journal-thumb">
        <i class="ph ph-play" aria-hidden="true"></i>
        <span>${entry.label}</span>
      </div>
      <div class="journal-body">
        <div class="journal-meta">
          <span>${entry.date}</span>
          <span>${entry.method}</span>
        </div>
        <p>${entry.caption}</p>
      </div>
    `;
    if (drill) {
      const link = document.createElement("button");
      link.className = "journal-drill-link";
      link.type = "button";
      link.textContent = drill.title;
      link.addEventListener("click", () => showDrillDetail(drill));
      article.querySelector(".journal-body").append(link);
    }
    els.profileJournalList.append(article);
  });
}

function renderJournalDrillOptions() {
  if (!els.journalDrillSelect) return;
  const currentValue = els.journalDrillSelect.value;
  els.journalDrillSelect.innerHTML = `
    <option value="">No linked drill</option>
    ${state.drills.map((drill) => `<option value="${drill.id}">${drill.title}</option>`).join("")}
  `;
  if (currentValue) els.journalDrillSelect.value = currentValue;
}

function renderLibraryMode() {
  const isDetailOpen = Boolean(state.libraryDetailDrillId);
  els.libraryWorkspace.hidden = isDetailOpen;
  els.libraryDetailPage.hidden = !isDetailOpen;
}

function openLibraryDrillPage(drill) {
  closeLibraryIndex();
  state.libraryDetailDrillId = drill.id;
  renderLibraryDetailPage(drill);
  renderLibraryMode();
  window.scrollTo(0, 0);
}

function closeLibraryDrillPage() {
  state.libraryDetailDrillId = null;
  els.libraryDetailPage.innerHTML = "";
  renderLibraryMode();
  updateLibraryTopOffset();
}

function renderLibraryDetailPage(drill) {
  const primaryContext = drill.contexts[0];
  const primaryBadge = contextBadgePaths[primaryContext];
  const tags = [
    ...drill.trainingTags.slice(0, 8).map((tag) => `<span class="chip tag-chip">${tag}</span>`),
    ...drill.customTags.map((tag) => `<span class="chip tag-chip">${tag}</span>`),
  ].join("");

  els.libraryDetailPage.innerHTML = `
    <header class="library-detail-header">
      ${primaryBadge ? `<img class="library-detail-corner-badge" src="${primaryBadge}" alt="" aria-hidden="true" />` : ""}
      <button class="detail-back-button" type="button" id="libraryDetailBack" aria-label="Back to drill list">
        <i class="ph ph-arrow-left" aria-hidden="true"></i>
      </button>
      <p class="kicker">Training Log</p>
      <div class="library-detail-title-row">
        <div>
          <h1>${drill.title}</h1>
          <p>${primaryContext}</p>
        </div>
      </div>
    </header>

    <article class="library-detail-body">
      <p class="library-detail-summary">${drill.summary}</p>
      <div class="detail-tags">${tags}</div>
      <section class="detail-section">
        <h3>Steps</h3>
        <ol>${drill.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
      </section>
    </article>
  `;

  qs("libraryDetailBack").addEventListener("click", closeLibraryDrillPage);
}

function updateLibraryTopOffset() {
  window.requestAnimationFrame(() => {
    const height = Math.ceil(els.libraryStickyTop.getBoundingClientRect().height);
    els.libraryWorkspace.style.setProperty("--library-fixed-top", `${height}px`);
  });
}

function renderLibraryHeader(count) {
  const context = state.selectedContext;
  const badge = contextBadgePaths[context];
  els.libraryHeaderIcon.hidden = !badge;
  if (badge) els.libraryHeaderIcon.src = badge;
  els.libraryHeaderTitle.textContent = context === "All" ? "All Drills" : context;
  els.libraryHeaderCount.textContent = `${count} captured ${count === 1 ? "drill" : "drills"}`;
}

function truncateLabel(label, maxLength = 30) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1).trim()}...`;
}

function estimatedTextWidth(label, type) {
  const characterWidth = type === "context" ? 7.4 : 6.4;
  return Math.ceil(label.length * characterWidth);
}

function measureNodeBox(node) {
  const labelLines = node.displayLines || [node.displayLabel];
  const labelWidth = Math.max(...labelLines.map((line) => estimatedTextWidth(line, node.type)));
  const isAnchor = node.type === "context" || node.isAnchor;
  const labelHeight = isAnchor ? labelLines.length * 17 : 14;
  const padding = isAnchor ? 9 : 7;

  if (isAnchor) {
    const halfWidth = Math.max(node.r + padding, labelWidth / 2 + padding);
    return {
      left: -halfWidth,
      right: halfWidth,
      top: -node.r - padding,
      bottom: node.r + 18 + labelHeight + padding,
    };
  }

  return {
    left: -node.r - padding,
    right: node.r + 8 + labelWidth + padding,
    top: -Math.max(node.r + padding, labelHeight / 2 + padding),
    bottom: Math.max(node.r + padding, labelHeight / 2 + padding),
  };
}

function pointerToSvg(svg, event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function renderNetworkModeSwitch() {
  els.networkModeSwitch.querySelectorAll("[data-network-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.networkMode === state.networkMode);
  });
}

function syncNetworkTagInput() {
  const query = state.networkMode === "skill" ? state.networkTagQuery : state.workoutTagQuery;
  if (els.networkTagSearch.value !== query) els.networkTagSearch.value = query;
}

function renderControlsMode() {
  const isSkillGraph = state.networkMode === "skill";
  const isWorkoutGraph = state.networkMode === "workout";
  els.skillLayerControls.hidden = state.networkMode === "bridge";
  els.skillTagFilterControls.hidden = false;
  els.networkLayerLabel.textContent = isSkillGraph ? "Layers" : "Workout Layers";
  els.primaryLayerToggleText.textContent = isSkillGraph ? "Show tag nodes" : "Show workout tag nodes";
  els.secondaryLayerToggleLabel.hidden = !isSkillGraph;
  els.secondaryLayerToggleText.textContent = "Show custom tag nodes";
  els.networkTagFilterLabel.textContent = isSkillGraph ? "Tag Filter" : "Workout Tag Filter";
  els.networkTagSearch.placeholder = isSkillGraph ? "Search tags" : "Search workout tags";
  els.toggleTrainingTags.checked = isSkillGraph ? state.showTrainingTags : state.showWorkoutTags;
  els.toggleCustomTags.checked = state.showCustomTags;
  els.primaryLayerToggleLabel.hidden = !isSkillGraph && !isWorkoutGraph;
  syncNetworkTagInput();
}

function renderNetwork() {
  const previousNodes = networkSimulation?.mode === state.networkMode ? networkSimulation.nodes : [];
  const previousPositions = new Map((previousNodes || []).map((node) => [
    node.id,
    {
      x: node.x,
      y: node.y,
      anchorX: node.anchorX,
      anchorY: node.anchorY,
    },
  ]));

  if (networkSimulation?.frame) cancelAnimationFrame(networkSimulation.frame);

  const svg = els.networkSvg;
  const width = svg.clientWidth || window.innerWidth;
  const height = svg.clientHeight || window.innerHeight - 72;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";
  renderNetworkModeSwitch();
  renderControlsMode();
  svg.onpointerdown = (event) => {
    if (event.target !== svg) return;
    if (state.networkMode === "skill" && state.focusedContext) {
      state.focusedContext = null;
      renderNetwork();
      return;
    }
    if (state.networkMode !== "skill" && state.focusedGraphNode) {
      state.focusedGraphNode = null;
      state.focusedGraphLabel = null;
      renderNetwork();
    }
  };

  if (state.networkMode !== "skill") {
    renderPhysicalNetwork(svg, width, height, previousPositions);
    return;
  }

  svg.onpointerdown = (event) => {
    if (event.target !== svg || !state.focusedContext) return;
    state.focusedContext = null;
    renderNetwork();
  };

  const contextList = contexts.filter((context) => context !== "All");
  const centerX = width / 2;
  const centerY = height / 2;
  const contextRadiusX = Math.min(width * 0.34, 210);
  const contextRadiusY = Math.min(height * 0.29, 230);
  const nodes = [];
  const edges = [];

  contextList.forEach((context, index) => {
    const angle = -Math.PI / 2 + (index / contextList.length) * Math.PI * 2;
    const anchorX = centerX + Math.cos(angle) * contextRadiusX;
    const anchorY = centerY + Math.sin(angle) * contextRadiusY;
    const previous = previousPositions.get(context);
    nodes.push({
      id: context,
      label: context,
      displayLabel: context,
      type: "context",
      x: previous?.x ?? anchorX,
      y: previous?.y ?? anchorY,
      vx: 0,
      vy: 0,
      anchorX: previous?.anchorX ?? anchorX,
      anchorY: previous?.anchorY ?? anchorY,
      r: contextBadgePaths[context] ? 28 : 13,
      badge: contextBadgePaths[context] || null,
    });
  });

  state.drills.forEach((drill, index) => {
    const primary = drill.contexts[0];
    const contextNode = nodes.find((node) => node.id === primary);
    if (!contextNode) return;
    const angle = Math.atan2(contextNode.anchorY - centerY, contextNode.anchorX - centerX) + ((index % 5) - 2) * 0.16;
    const depth = 82 + (index % 4) * 26;
    const previous = previousPositions.get(drill.id);
    const node = {
      id: drill.id,
      label: drill.title,
      displayLabel: truncateLabel(drill.title, 24),
      type: "drill",
      drill,
      x: previous?.x ?? contextNode.x + Math.cos(angle) * depth,
      y: previous?.y ?? contextNode.y + Math.sin(angle) * depth,
      vx: 0,
      vy: 0,
      r: 7,
    };
    nodes.push(node);
    drill.contexts.forEach((context) => edges.push({ from: context, to: drill.id }));

    if (state.showTrainingTags) {
      const visibleTags = [...drill.trainingTags.slice(0, 2)];
      state.activeNetworkTags.forEach((tag) => {
        if (drill.trainingTags.includes(tag) && !visibleTags.includes(tag)) visibleTags.push(tag);
      });
      visibleTags.forEach((tag) => edges.push({ from: tag, to: drill.id, type: "trainingTag" }));
    }
    if (state.showCustomTags) {
      drill.customTags.slice(0, 1).forEach((tag) => edges.push({ from: tag, to: drill.id, type: "customTag" }));
    }
  });

  if (state.showTrainingTags || state.showCustomTags) {
    const tagNames = new Set();
    edges.forEach((edge) => {
      if ((edge.type === "trainingTag" || edge.type === "customTag") && !nodes.some((node) => node.id === edge.from)) tagNames.add(edge.from);
    });
    [...tagNames].slice(0, 26).forEach((tag, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(tagNames.size, 1)) * Math.PI * 2;
      const type = state.drills.some((drill) => drill.customTags.includes(tag)) ? "customTag" : "trainingTag";
      const previous = previousPositions.get(tag);
      nodes.push({
        id: tag,
        label: tag,
        displayLabel: truncateLabel(tag, 22),
        type,
        x: previous?.x ?? centerX + Math.cos(angle) * contextRadiusX * 0.62,
        y: previous?.y ?? centerY + Math.sin(angle) * contextRadiusY * 0.62,
        vx: 0,
        vy: 0,
        r: 6,
      });
    });
  }

  nodes.forEach((node) => {
    node.box = measureNodeBox(node);
  });

  const filters = currentNetworkFilters();
  const visibleDrills = matchingNetworkDrills(filters);
  const visibleDrillIds = new Set(visibleDrills.map((drill) => drill.id));
  const allDrillIds = new Set(state.drills.map((drill) => drill.id));
  const edgeDrillId = (edge) => {
    if (allDrillIds.has(edge.from)) return edge.from;
    if (allDrillIds.has(edge.to)) return edge.to;
    return null;
  };
  const visibleNodeIds = new Set();

  if (filters.hasActiveFilters) {
    visibleDrills.forEach((drill) => {
      visibleNodeIds.add(drill.id);
      drill.contexts.forEach((context) => visibleNodeIds.add(context));
    });
    if (filters.focusContext) visibleNodeIds.add(filters.focusContext);
    filters.selectedTags.forEach((tag) => visibleNodeIds.add(tag));
    edges.forEach((edge) => {
      const drillId = edgeDrillId(edge);
      if (!drillId || !visibleDrillIds.has(drillId)) return;
      visibleNodeIds.add(edge.from);
      visibleNodeIds.add(edge.to);
    });
  }

  const edgeElements = [];
  edges.forEach((edge) => {
    const from = nodes.find((node) => node.id === edge.from);
    const to = nodes.find((node) => node.id === edge.to);
    if (!from || !to) return;
    const contextEdge = edge.type !== "trainingTag" && edge.type !== "customTag";
    const tagEdge = edge.type === "trainingTag" || edge.type === "customTag";
    const drillId = edgeDrillId(edge);
    const survivesFilters = !filters.hasActiveFilters || (drillId && visibleDrillIds.has(drillId));
    const focusEdge = filters.focusContext && contextEdge && survivesFilters && (edge.from === filters.focusContext || edge.to === filters.focusContext);
    const visibleTagEdge = tagEdge && survivesFilters;
    const focusMuted = filters.hasFocus && !focusEdge && !visibleTagEdge;
    const queryMuted = filters.hasActiveFilters && !survivesFilters;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", [
      "edge",
      queryMuted ? "is-muted" : "",
      focusEdge ? "is-focus-edge" : "",
      visibleTagEdge ? "is-visible-tag-edge" : "",
      focusMuted ? "is-focus-muted" : "",
    ].filter(Boolean).join(" "));
    svg.append(line);
    edgeElements.push({ edge, from, to, el: line });
  });

  const nodeElements = [];
  nodes.forEach((node) => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const survivesFilters = !filters.hasActiveFilters || visibleNodeIds.has(node.id);
    const muted = filters.hasActiveFilters && !survivesFilters;
    const match = filters.hasActiveFilters && (
      (node.type === "drill" && visibleDrillIds.has(node.id))
      || filters.selectedTags.includes(node.label)
    );
    const focusMuted = filters.hasFocus && muted;
    const focusTarget = filters.focusContext && node.type === "drill" && visibleDrillIds.has(node.id) && node.drill.contexts.includes(filters.focusContext);
    const focusRoot = filters.focusContext && node.id === filters.focusContext;
    group.setAttribute("class", [
      "node",
      node.type,
      muted ? "is-muted" : "",
      match ? "is-match" : "",
      focusMuted ? "is-focus-muted" : "",
      focusTarget ? "is-focus-target" : "",
      focusRoot ? "is-focus-root" : "",
    ].filter(Boolean).join(" "));
    group.style.cursor = "pointer";
    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hitArea.setAttribute("class", "hit-area");
    hitArea.setAttribute("x", node.box.left - 8);
    hitArea.setAttribute("y", node.box.top - 8);
    hitArea.setAttribute("width", node.box.right - node.box.left + 16);
    hitArea.setAttribute("height", node.box.bottom - node.box.top + 16);
    hitArea.setAttribute("rx", 12);
    group.append(hitArea);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", node.r);
    if (node.badge) {
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      const size = node.r * 2;
      image.setAttribute("href", node.badge);
      image.setAttribute("x", -size / 2);
      image.setAttribute("y", -size / 2);
      image.setAttribute("width", size);
      image.setAttribute("height", size);
      image.setAttribute("preserveAspectRatio", "xMidYMid meet");
      group.append(image);
    } else {
      group.append(circle);
    }
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    if (node.type === "context") {
      text.setAttribute("x", 0);
      text.setAttribute("y", node.r + 16);
      text.setAttribute("text-anchor", "middle");
    } else {
      text.setAttribute("x", node.r + 7);
      text.setAttribute("y", 4);
    }
    const labelIsAnchor = node.type === "context" || node.isAnchor;
    (node.displayLines || [node.displayLabel]).forEach((line, index) => {
      const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      tspan.setAttribute("x", labelIsAnchor ? 0 : node.r + 7);
      if (index > 0) tspan.setAttribute("dy", "17");
      tspan.textContent = line;
      text.append(tspan);
    });
    group.append(text);
    bindNodePointer(group, node, svg);
    svg.append(group);
    nodeElements.push({ node, group });
  });

  networkSimulation = {
    alpha: 1,
    frame: null,
    width,
    height,
    nodes,
    edgeElements,
    nodeElements,
    dragging: null,
    mode: state.networkMode,
  };
  runNetworkSimulation(networkSimulation);
  renderStateChips();
  renderSearchControls();
  renderControlsMode();
  els.controlsButton.classList.toggle("is-active", state.showTrainingTags || state.showCustomTags || state.activeNetworkTags.size > 0);
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function exerciseById(id) {
  return state.exercises.find((exercise) => exercise.id === id);
}

function pathwayById(id) {
  return state.pathways.find((pathway) => pathway.id === id);
}

function pathwayExercises(pathway) {
  return (pathway.exerciseIds || []).map(exerciseById).filter(Boolean);
}

function exerciseSearchText(exercise) {
  return [
    exercise.title,
    exercise.summary,
    ...(exercise.workoutTypes || []),
    ...(exercise.physicalQualities || []),
    ...(exercise.equipment || []),
    ...(exercise.bodyAreas || []),
    ...(exercise.muayThaiRelevance || []),
    ...(exercise.aliases || []),
    ...(exercise.cues || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function pathwaySearchText(pathway) {
  return [
    pathway.title,
    pathway.kind,
    pathway.summary,
    pathway.goal,
    pathway.notes,
    ...(pathway.structure || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchingPathways(searchTerms = activeNetworkSearchTerms()) {
  if (!searchTerms.length) return [];
  return state.pathways.filter((pathway) => {
    const text = pathwaySearchText(pathway);
    return searchTerms.every((term) => text.includes(term));
  });
}

function pathwayChipLabel(term) {
  if (state.networkMode === "skill") return `Search: ${term}`;
  const matching = state.pathways.filter((pathway) => pathwaySearchText(pathway).includes(term));
  if (matching.length === 1) return `Pathway: ${matching[0].title}`;
  if (matching.length > 1) return `Pathway search: ${term}`;
  return `Search: ${term}`;
}

function physicalSearchText(node) {
  const item = node.exercise || {};
  return [
    node.label,
    node.group,
    exerciseSearchText(item),
  ].filter(Boolean).join(" ").toLowerCase();
}

function createGraphNode({ id, label, type, x, y, r, previousPositions, isAnchor = false, item = null, badge = null }) {
  const previous = previousPositions.get(id);
  const displayLabel = truncateLabel(label, type === "exercise" ? 18 : 20);
  return {
    id,
    label,
    displayLabel,
    displayLines: type === "workoutType" && label === "Mobility & Stretching" ? ["Mobility &", "Stretching"] : [displayLabel],
    type,
    isAnchor,
    exercise: type === "exercise" ? item : null,
    badge,
    x: previous?.x ?? x,
    y: previous?.y ?? y,
    vx: 0,
    vy: 0,
    anchorX: previous?.anchorX ?? x,
    anchorY: previous?.anchorY ?? y,
    r,
  };
}

function buildWorkoutGraph(width, height, previousPositions) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = Math.min(width * 0.34, 210);
  const radiusY = Math.min(height * 0.31, 245);
  const nodes = [];
  const edges = [];
  const workoutTypes = state.workoutTypes.length
    ? state.workoutTypes
    : uniqueItems(state.exercises.flatMap((exercise) => exercise.workoutTypes));

  workoutTypes.forEach((typeName, index) => {
    const angle = -Math.PI / 2 + (index / workoutTypes.length) * Math.PI * 2;
    nodes.push(createGraphNode({
      id: `workoutType:${typeName}`,
      label: typeName,
      type: "workoutType",
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
      r: workoutTypeBadgePaths[typeName] ? 28 : 15,
      previousPositions,
      isAnchor: true,
      badge: workoutTypeBadgePaths[typeName] || null,
    }));
  });

  state.exercises.forEach((exercise, index) => {
    const primaryType = exercise.workoutTypes?.[0] || workoutTypes[index % Math.max(workoutTypes.length, 1)];
    const anchor = nodes.find((node) => node.id === `workoutType:${primaryType}`);
    const anchorAngle = anchor ? Math.atan2(anchor.anchorY - centerY, anchor.anchorX - centerX) : (index / Math.max(state.exercises.length, 1)) * Math.PI * 2;
    const fan = ((index % 4) - 1.5) * 0.18;
    const depth = 78 + (index % 3) * 28;
    nodes.push(createGraphNode({
      id: exercise.id,
      label: exercise.title,
      type: "exercise",
      x: anchor ? anchor.x + Math.cos(anchorAngle + fan) * depth : centerX + Math.cos(anchorAngle) * radiusX * 0.55,
      y: anchor ? anchor.y + Math.sin(anchorAngle + fan) * depth : centerY + Math.sin(anchorAngle) * radiusY * 0.55,
      r: 7,
      previousPositions,
      item: exercise,
    }));
    (exercise.workoutTypes || []).forEach((typeName) => {
      edges.push({ from: `workoutType:${typeName}`, to: exercise.id, type: "workoutTypeLink" });
    });
    visibleWorkoutTagsForExercise(exercise).forEach((tag) => {
      edges.push({ from: workoutTagNodeId(tag), to: exercise.id, type: "workoutTag" });
    });
  });

  const tagNodeIds = new Set(edges.filter((edge) => edge.type === "workoutTag").map((edge) => edge.from));
  [...tagNodeIds].forEach((tagId, index) => {
    const tag = workoutTagNodeLabel(tagId);
    const angle = -Math.PI / 2 + (index / Math.max(tagNodeIds.size, 1)) * Math.PI * 2;
    nodes.push(createGraphNode({
      id: tagId,
      label: tag,
      type: workoutTagNodeType(tag),
      x: centerX + Math.cos(angle) * radiusX * 0.56,
      y: centerY + Math.sin(angle) * radiusY * 0.56,
      r: 6,
      previousPositions,
    }));
  });

  addPathwayEdges(edges);
  return { nodes, edges };
}

function buildBridgeGraph(width, height, previousPositions) {
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes = [];
  const edges = [];
  const relevanceNames = uniqueItems(state.exercises.flatMap((exercise) => exercise.muayThaiRelevance)).slice(0, 10);

  relevanceNames.forEach((relevance, index) => {
    const y = centerY - Math.min(height * 0.34, 255) + (index / Math.max(relevanceNames.length - 1, 1)) * Math.min(height * 0.68, 510);
    nodes.push(createGraphNode({
      id: `relevance:${relevance}`,
      label: relevance,
      type: "relevance",
      x: width * 0.28,
      y,
      r: 9,
      previousPositions,
      isAnchor: true,
    }));
  });

  state.exercises.forEach((exercise, index) => {
    const y = centerY - Math.min(height * 0.31, 230) + (index / Math.max(state.exercises.length - 1, 1)) * Math.min(height * 0.62, 460);
    nodes.push(createGraphNode({
      id: exercise.id,
      label: exercise.title,
      type: "exercise",
      x: width * 0.68,
      y,
      r: 7,
      previousPositions,
      item: exercise,
    }));
    (exercise.muayThaiRelevance || []).forEach((relevance) => {
      edges.push({ from: `relevance:${relevance}`, to: exercise.id, type: "support" });
    });
  });

  addPathwayEdges(edges);
  return { nodes, edges };
}

function addPathwayEdges(edges) {
  matchingPathways().forEach((pathway, pathwayIndex) => {
    (pathway.exerciseIds || []).forEach((exerciseId, index, exerciseIds) => {
      const nextId = exerciseIds[index + 1];
      if (!nextId) return;
      edges.push({
        from: exerciseId,
        to: nextId,
        type: "pathway",
        pathwayId: pathway.id,
        pathwayIndex,
      });
    });
  });
}

function visiblePhysicalGraph(nodes, edges) {
  const searchTerms = activeNetworkSearchTerms();
  const focusId = state.focusedGraphNode;
  const selectedTags = [...state.activeWorkoutTags];
  const active = Boolean(searchTerms.length || focusId || selectedTags.length);
  const visibleNodeIds = new Set();
  const matchNodeIds = new Set();
  const exerciseIds = new Set(state.exercises.map((exercise) => exercise.id));

  if (!active) {
    nodes.forEach((node) => visibleNodeIds.add(node.id));
    return { active, visibleNodeIds, matchNodeIds };
  }

  const connectedExerciseIds = (nodeId) => {
    const ids = new Set();
    edges.forEach((edge) => {
      if (edge.from === nodeId && exerciseIds.has(edge.to)) ids.add(edge.to);
      if (edge.to === nodeId && exerciseIds.has(edge.from)) ids.add(edge.from);
    });
    return ids;
  };

  const candidateExerciseIds = new Set();
  const matchedRootIds = new Set();
  const pathwayNodeIds = new Set();
  matchingPathways(searchTerms).forEach((pathway) => {
    (pathway.exerciseIds || []).forEach((exerciseId) => pathwayNodeIds.add(exerciseId));
  });

  if (searchTerms.length) {
    nodes.forEach((node) => {
      const matchesSearch = searchTerms.every((term) => physicalSearchText(node).includes(term));
      if (!matchesSearch) return;
      matchedRootIds.add(node.id);
      if (exerciseIds.has(node.id)) {
        candidateExerciseIds.add(node.id);
      } else {
        connectedExerciseIds(node.id).forEach((exerciseId) => candidateExerciseIds.add(exerciseId));
      }
    });
    pathwayNodeIds.forEach((exerciseId) => candidateExerciseIds.add(exerciseId));
  } else {
    exerciseIds.forEach((exerciseId) => candidateExerciseIds.add(exerciseId));
  }

  [...candidateExerciseIds].forEach((exerciseId) => {
    const exercise = exerciseById(exerciseId);
    if (!exercise || !exerciseMatchesWorkoutTags(exercise, selectedTags)) candidateExerciseIds.delete(exerciseId);
  });

  if (focusId) {
    visibleNodeIds.add(focusId);
    const focusExerciseIds = exerciseIds.has(focusId) ? new Set([focusId]) : connectedExerciseIds(focusId);
    [...candidateExerciseIds].forEach((exerciseId) => {
      if (!focusExerciseIds.has(exerciseId)) candidateExerciseIds.delete(exerciseId);
    });
  }

  candidateExerciseIds.forEach((exerciseId) => {
    visibleNodeIds.add(exerciseId);
    matchNodeIds.add(exerciseId);
  });

  edges.forEach((edge) => {
    const fromIsVisibleExercise = candidateExerciseIds.has(edge.from);
    const toIsVisibleExercise = candidateExerciseIds.has(edge.to);
    if (edge.type === "pathway") {
      if (fromIsVisibleExercise && toIsVisibleExercise) {
        visibleNodeIds.add(edge.from);
        visibleNodeIds.add(edge.to);
      }
      return;
    }
    if (fromIsVisibleExercise || toIsVisibleExercise) {
      visibleNodeIds.add(edge.from);
      visibleNodeIds.add(edge.to);
    }
  });

  selectedTags.forEach((tag) => {
    const tagId = workoutTagNodeId(tag);
    visibleNodeIds.add(tagId);
    matchNodeIds.add(tagId);
  });
  matchedRootIds.forEach((id) => {
    visibleNodeIds.add(id);
    matchNodeIds.add(id);
  });
  if (focusId) matchNodeIds.add(focusId);

  return { active, visibleNodeIds, matchNodeIds };
}

function renderPhysicalNetwork(svg, width, height, previousPositions) {
  const { nodes, edges } = state.networkMode === "bridge"
    ? buildBridgeGraph(width, height, previousPositions)
    : buildWorkoutGraph(width, height, previousPositions);
  nodes.forEach((node) => {
    node.box = measureNodeBox(node);
  });

  const visibility = visiblePhysicalGraph(nodes, edges);
  const edgeElements = [];
  edges.forEach((edge) => {
    const from = nodes.find((node) => node.id === edge.from);
    const to = nodes.find((node) => node.id === edge.to);
    if (!from || !to) return;
    const edgeVisible = !visibility.active || (visibility.visibleNodeIds.has(edge.from) && visibility.visibleNodeIds.has(edge.to));
    const focusEdge = state.focusedGraphNode && edgeVisible && (edge.from === state.focusedGraphNode || edge.to === state.focusedGraphNode);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", [
      "edge",
      edge.type,
      !edgeVisible ? "is-muted" : "",
      focusEdge ? "is-focus-edge" : "",
    ].filter(Boolean).join(" "));
    if (edge.type === "pathway") line.style.stroke = pathwayColor(edge.pathwayIndex);
    svg.append(line);
    edgeElements.push({ edge, from, to, el: line });
  });

  const nodeElements = [];
  const nodeZIndex = (node) => {
    if (node.type === "workoutType" || node.type === "relevance" || node.type === "quality" || node.type === "skillLink" || node.type === "coreIdeaNode") return 0;
    if (node.type === "exercise") return 1;
    return 1;
  };
  [...nodes].sort((a, b) => nodeZIndex(a) - nodeZIndex(b)).forEach((node) => {
    const visible = !visibility.active || visibility.visibleNodeIds.has(node.id);
    const match = visibility.matchNodeIds.has(node.id);
    const focusRoot = state.focusedGraphNode === node.id;
    const focusTarget = state.focusedGraphNode && edges.some((edge) => (
      (edge.from === state.focusedGraphNode && edge.to === node.id)
      || (edge.to === state.focusedGraphNode && edge.from === node.id)
    ));
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", [
      "node",
      node.type,
      !visible ? "is-muted" : "",
      match ? "is-match" : "",
      focusRoot ? "is-focus-root" : "",
      focusTarget ? "is-focus-target" : "",
    ].filter(Boolean).join(" "));
    group.style.cursor = "pointer";

    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hitArea.setAttribute("class", "hit-area");
    hitArea.setAttribute("x", node.box.left - 8);
    hitArea.setAttribute("y", node.box.top - 8);
    hitArea.setAttribute("width", node.box.right - node.box.left + 16);
    hitArea.setAttribute("height", node.box.bottom - node.box.top + 16);
    hitArea.setAttribute("rx", 12);
    group.append(hitArea);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", node.r);
    if (node.badge) {
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      const size = node.r * 2;
      image.setAttribute("href", node.badge);
      image.setAttribute("x", -size / 2);
      image.setAttribute("y", -size / 2);
      image.setAttribute("width", size);
      image.setAttribute("height", size);
      image.setAttribute("preserveAspectRatio", "xMidYMid meet");
      group.append(image);
    } else {
      group.append(circle);
    }

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    if (node.isAnchor) {
      text.setAttribute("x", 0);
      text.setAttribute("y", node.r + 16);
      text.setAttribute("text-anchor", "middle");
    } else {
      text.setAttribute("x", node.r + 7);
      text.setAttribute("y", 4);
    }
    const labelIsAnchor = Boolean(node.isAnchor);
    (node.displayLines || [node.displayLabel]).forEach((line, index) => {
      const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      tspan.setAttribute("x", labelIsAnchor ? 0 : node.r + 7);
      if (index > 0) tspan.setAttribute("dy", "17");
      tspan.textContent = line;
      text.append(tspan);
    });
    group.append(text);
    bindNodePointer(group, node, svg);
    svg.append(group);
    nodeElements.push({ node, group });
  });

  networkSimulation = {
    alpha: 1,
    frame: null,
    width,
    height,
    nodes,
    edgeElements,
    nodeElements,
    dragging: null,
    mode: state.networkMode,
  };
  runNetworkSimulation(networkSimulation);
  renderStateChips();
  renderSearchControls();
  renderControlsMode();
  els.controlsButton.classList.toggle("is-active", Boolean(
    state.focusedGraphNode
    || activeNetworkSearchTerms().length
    || state.activeWorkoutTags.size
    || (state.networkMode === "workout" && state.showWorkoutTags)
  ));
}

function pathwayColor(index = 0) {
  const colors = ["#D14A32", "#2C6F7B", "#C48A24", "#7B5FA7"];
  return colors[index % colors.length];
}

function bindNodePointer(group, node, svg) {
  let start = null;
  let dragOffset = null;
  let moved = false;
  let tapMoveThreshold = 6;
  let suppressNextClick = false;

  group.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    start = pointerToSvg(svg, event);
    tapMoveThreshold = event.pointerType === "touch" ? 12 : 6;
    dragOffset = {
      x: node.x - start.x,
      y: node.y - start.y,
    };
    moved = false;
    node.dragging = true;
    node.vx = 0;
    node.vy = 0;
    networkSimulation.dragging = node;
    group.classList.add("is-dragging");
    group.setPointerCapture(event.pointerId);
  });

  group.addEventListener("pointermove", (event) => {
    if (!node.dragging || !start || !dragOffset) return;
    event.preventDefault();
    const point = pointerToSvg(svg, event);
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    if (Math.hypot(dx, dy) > tapMoveThreshold) moved = true;
    if (!moved) return;
    node.x = point.x + dragOffset.x;
    node.y = point.y + dragOffset.y;
    node.vx = 0;
    node.vy = 0;
    if (node.type === "context" || node.isAnchor) {
      node.anchorX = node.x;
      node.anchorY = node.y;
    }
    networkSimulation.alpha = Math.max(networkSimulation.alpha, 0.62);
    runNetworkSimulation(networkSimulation);
  });

  const finishDrag = (event) => {
    if (!node.dragging) return;
    event.stopPropagation();
    node.dragging = false;
    networkSimulation.dragging = null;
    group.classList.remove("is-dragging");
    if (event.pointerId !== undefined && group.hasPointerCapture(event.pointerId)) {
      group.releasePointerCapture(event.pointerId);
    }
    networkSimulation.alpha = Math.max(networkSimulation.alpha, 0.42);
    runNetworkSimulation(networkSimulation);
    if (!moved && event.type === "pointerup") {
      suppressNextClick = true;
      window.setTimeout(() => {
        handleNodeClick(node);
        suppressNextClick = false;
      }, 0);
    } else if (moved) {
      suppressNextClick = true;
    }
    start = null;
    dragOffset = null;
  };

  group.addEventListener("pointerup", finishDrag);
  group.addEventListener("pointercancel", finishDrag);
  group.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    handleNodeClick(node);
  });
}

function runNetworkSimulation(simulation) {
  if (simulation.frame) return;

  const step = () => {
    if (networkSimulation !== simulation) return;
    tickNetwork(simulation);
    renderNetworkFrame(simulation);
    simulation.alpha *= 0.982;

    if (simulation.alpha > 0.012 || simulation.dragging) {
      simulation.frame = requestAnimationFrame(step);
    } else {
      simulation.frame = null;
    }
  };

  simulation.frame = requestAnimationFrame(step);
}

function tickNetwork(simulation) {
  const { nodes, edgeElements, width, height } = simulation;
  const alpha = simulation.alpha;
  const centerX = width / 2;
  const centerY = height / 2;

  edgeElements.forEach(({ from, to }) => {
    const dx = to.x - from.x || 0.01;
    const dy = to.y - from.y || 0.01;
    const distance = Math.hypot(dx, dy);
    const hasAnchor = from.type === "context" || to.type === "context" || from.isAnchor || to.isAnchor;
    const desired = hasAnchor ? 148 : 108;
    const strength = hasAnchor ? 0.012 : 0.015;
    const force = ((distance - desired) / distance) * strength * alpha;
    const fx = dx * force;
    const fy = dy * force;
    if (!from.dragging) {
      from.vx += fx;
      from.vy += fy;
    }
    if (!to.dragging) {
      to.vx -= fx;
      to.vy -= fy;
    }
  });

  nodes.forEach((node) => {
    if ((node.type === "context" || node.isAnchor) && !node.dragging) {
      node.vx += (node.anchorX - node.x) * 0.007 * alpha;
      node.vy += (node.anchorY - node.y) * 0.007 * alpha;
    } else if (!node.dragging) {
      node.vx += (centerX - node.x) * 0.0007 * alpha;
      node.vy += (centerY - node.y) * 0.0007 * alpha;
    }
  });

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x || 0.01;
      const dy = b.y - a.y || 0.01;
      const distanceSquared = dx * dx + dy * dy;
      const needsSpace = a.type === "context" || b.type === "context" || a.isAnchor || b.isAnchor;
      const strength = (needsSpace ? 1320 : 720) * alpha;
      const force = Math.min(strength / distanceSquared, 0.24);
      const distance = Math.sqrt(distanceSquared);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (!a.dragging) {
        a.vx -= fx;
        a.vy -= fy;
      }
      if (!b.dragging) {
        b.vx += fx;
        b.vy += fy;
      }
    }
  }

  nodes.forEach((node) => {
    if (!node.dragging) {
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= 0.9;
      node.vy *= 0.9;
    }
    keepNodeInBounds(node, width, height);
  });

  for (let pass = 0; pass < 2; pass += 1) {
    resolveLabelCollisions(nodes, Math.min(alpha + 0.08, 0.72));
  }

  nodes.forEach((node) => keepNodeInBounds(node, width, height));
}

function resolveLabelCollisions(nodes, alpha) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const aLeft = a.x + a.box.left;
      const aRight = a.x + a.box.right;
      const aTop = a.y + a.box.top;
      const aBottom = a.y + a.box.bottom;
      const bLeft = b.x + b.box.left;
      const bRight = b.x + b.box.right;
      const bTop = b.y + b.box.top;
      const bBottom = b.y + b.box.bottom;
      const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
      const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

      if (overlapX <= 0 || overlapY <= 0) continue;

      const xDirection = a.x < b.x ? -1 : 1;
      const yDirection = a.y < b.y ? -1 : 1;
      const push = Math.min(4, (Math.min(overlapX, overlapY) / 2 + 2) * alpha * 0.58);

      if (overlapX < overlapY) {
        if (!a.dragging) a.x += xDirection * push;
        if (!b.dragging) b.x -= xDirection * push;
      } else {
        if (!a.dragging) a.y += yDirection * push;
        if (!b.dragging) b.y -= yDirection * push;
      }
    }
  }
}

function keepNodeInBounds(node, width, height) {
  const margin = 10;
  const left = margin - node.box.left;
  const right = width - margin - node.box.right;
  const top = margin - node.box.top;
  const bottom = height - margin - node.box.bottom;
  node.x = Math.min(Math.max(node.x, left), right);
  node.y = Math.min(Math.max(node.y, top), bottom);
}

function renderNetworkFrame(simulation) {
  simulation.edgeElements.forEach(({ from, to, el }) => {
    el.setAttribute("x1", from.x);
    el.setAttribute("y1", from.y);
    el.setAttribute("x2", to.x);
    el.setAttribute("y2", to.y);
  });

  simulation.nodeElements.forEach(({ node, group }) => {
    group.setAttribute("transform", `translate(${node.x}, ${node.y})`);
  });
}

function handleNodeClick(node) {
  if (node.drill) return showDrillDetail(node.drill);
  if (node.exercise) return showExerciseDetail(node.exercise);
  if (state.networkMode !== "skill") {
    state.focusedGraphNode = state.focusedGraphNode === node.id ? null : node.id;
    state.focusedGraphLabel = state.focusedGraphNode ? node.label : null;
    renderNetwork();
    return;
  }
  if (!contexts.includes(node.label)) return;
  state.focusedContext = state.focusedContext === node.label ? null : node.label;
  renderNetwork();
}

function renderStateChips() {
  els.stateChips.innerHTML = "";
  const chips = [];
  if (state.networkMode !== "skill") {
    chips.push({ label: `${networkModes[state.networkMode]} Graph`, clear: () => { state.networkMode = "skill"; state.focusedGraphNode = null; state.focusedGraphLabel = null; syncNetworkTagInput(); renderNetworkTagFilters(); renderNetwork(); } });
  }
  if (state.networkMode === "skill" && state.focusedContext) {
    chips.push({ label: focusChipLabel(state.focusedContext), clear: () => { state.focusedContext = null; renderNetwork(); } });
  }
  if (state.networkMode !== "skill" && state.focusedGraphNode) {
    chips.push({ label: physicalFocusChipLabel(state.focusedGraphNode, state.focusedGraphLabel), clear: () => { state.focusedGraphNode = null; state.focusedGraphLabel = null; renderNetwork(); } });
  }
  state.networkSearchTerms.forEach((term) => {
    const label = pathwayChipLabel(term);
    chips.push({
      label,
      clear: () => {
        state.networkSearchTerms = state.networkSearchTerms.filter((searchTerm) => searchTerm !== term);
        renderNetwork();
      },
    });
  });
  if (state.networkMode === "skill") {
    state.activeNetworkTags.forEach((tag) => {
      chips.push({
        label: `Tag: ${tag}`,
        clear: () => {
          state.activeNetworkTags.delete(tag);
          renderNetworkTagFilters();
          renderNetwork();
        },
      });
    });
    if (state.showTrainingTags) chips.push({ label: "Tags on", clear: () => { state.showTrainingTags = false; els.toggleTrainingTags.checked = false; renderNetwork(); } });
    if (state.showCustomTags) chips.push({ label: "Custom Tags on", clear: () => { state.showCustomTags = false; els.toggleCustomTags.checked = false; renderNetwork(); } });
  } else {
    state.activeWorkoutTags.forEach((tag) => {
      chips.push({
        label: `Tag: ${tag}`,
        clear: () => {
          state.activeWorkoutTags.delete(tag);
          renderNetworkTagFilters();
          renderNetwork();
        },
      });
    });
    if (state.networkMode === "workout" && state.showWorkoutTags) chips.push({ label: "Workout Tags on", clear: () => { state.showWorkoutTags = false; els.toggleTrainingTags.checked = false; renderNetwork(); } });
  }

  chips.forEach((chip) => {
    const el = document.createElement("span");
    el.className = "chip is-accent";
    el.innerHTML = `${chip.label} <button aria-label="Clear ${chip.label}">x</button>`;
    el.querySelector("button").addEventListener("click", chip.clear);
    els.stateChips.append(el);
  });
}

function chipList(items = [], className = "chip") {
  return items.map((item) => `<span class="${className}">${item}</span>`).join("");
}

function showPathwayDetail(pathway) {
  const exercises = pathwayExercises(pathway);
  const tagChips = [
    chipList([pathway.kind], "chip core-idea-chip"),
  ].join("");

  els.detailTitle.className = "";
  els.detailTitle.textContent = pathway.title;
  els.detailContent.innerHTML = `
    <p class="muted">${pathway.summary}</p>
    <div class="detail-tags">${tagChips}</div>
    <section class="detail-section">
      <h3>Structure</h3>
      <ol>${(pathway.structure || []).map((block) => `<li>${block}</li>`).join("")}</ol>
    </section>
    <section class="detail-section">
      <h3>Pathway</h3>
      <ul>${exercises.map((exercise) => `<li>${exercise.title}</li>`).join("")}</ul>
    </section>
    <p class="muted">${pathway.goal || ""}</p>
  `;
  openSheet("detailSheet");
}

function showExerciseDetail(exercise) {
  const tagChips = [
    chipList(exercise.workoutTypes, "chip core-idea-chip"),
    chipList(exercise.physicalQualities, "chip core-idea-chip"),
    chipList(exercise.muayThaiRelevance),
    chipList(exercise.equipment),
    chipList(exercise.bodyAreas),
  ].join("");

  els.detailTitle.className = "";
  els.detailTitle.textContent = exercise.title;
  els.detailContent.innerHTML = `
    <p class="muted">${exercise.summary}</p>
    <div class="detail-tags">${tagChips}</div>
    <section class="detail-section">
      <h3>Cues</h3>
      <ol>${exercise.cues.map((cue) => `<li>${cue}</li>`).join("")}</ol>
    </section>
  `;
  openSheet("detailSheet");
}

function showDrillDetail(drill) {
  const primaryContext = drill.contexts[0];
  const primaryBadge = contextBadgePaths[primaryContext];
  const tagChips = [
    ...drill.trainingTags.slice(0, 8).map((tag) => `<span class="chip tag-chip">${tag}</span>`),
    ...drill.customTags.map((tag) => `<span class="chip tag-chip">${tag}</span>`),
  ].join("");

  els.detailTitle.className = primaryBadge ? "detail-title-row" : "";
  els.detailTitle.innerHTML = `
    ${primaryBadge ? `<img class="detail-context-icon" src="${primaryBadge}" alt="${primaryContext}" />` : ""}
    <span>${drill.title}</span>
  `;
  els.detailContent.innerHTML = `
    <p class="muted">${drill.summary}</p>
    <div class="detail-tags">
      ${tagChips}
    </div>
    <section class="detail-section">
      <h3>Steps</h3>
      <ol>${drill.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
    </section>
  `;
  openSheet("detailSheet");
}

window.addEventListener("resize", () => {
  if (state.view === "networkView") renderNetwork();
  if (state.view === "libraryView") updateLibraryTopOffset();
});

boot();
