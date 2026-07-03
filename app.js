/* Loop Dashboard - app.js
 * Plain JS, no build step. Reads ./loops.json to find which loop's
 * state file to fetch (with ?loop=<id> query override), then fetches
 * that loop's loop-state.json and renders the fixed dashboard sections.
 * Kept intentionally simple: this is a read-only viewer, not an editor.
 */

(function () {
  "use strict";

  const LOOPS_CONFIG_URL = "./loops.json";
  const LEGACY_STATE_URL = "./state/loop-state.json";

  const STATUS_LABEL = {
    todo: "未着手",
    doing: "実行中",
    review: "検証中",
    done: "完了",
    error: "エラー",
  };

  const KANBAN_COLUMNS = ["todo", "doing", "review", "done", "error"];

  const SKILL_RESULT_LABEL = {
    success: "成功",
    partial_failure: "一部失敗",
    failure: "失敗",
  };

  const REC_TYPE_LABEL = {
    next_action: "次の一手",
    new_skill: "新規スキル",
    risk: "リスク",
    cost: "コスト",
  };

  const FRESHNESS_LABEL = {
    stable: "枯れた型",
    fresh: "要鮮度",
    unverified: "未検証",
  };

  const FRESHNESS_BADGE_CLASS = {
    stable: "freshness-stable",
    fresh: "freshness-fresh",
    unverified: "freshness-unverified",
  };

  const OWNER_LABEL = {
    human: "人間",
    codex: "Codex",
    "local-llm": "ローカルLLM",
    "approval-gate": "承認ゲート",
  };

  const CONFIDENCE_LABEL = {
    high: "確信度: 高",
    medium: "確信度: 中",
    low: "確信度: 低",
  };

  const CONFIDENCE_BADGE_CLASS = {
    high: "badge-done",
    medium: "badge-review",
    low: "badge-error",
  };

  const REFERENCE_KIND_LABEL = {
    "same-domain": "同土俵",
    analogy: "アナロジー",
    "user-specified": "ユーザー指定",
  };

  const REFERENCE_KIND_BADGE_CLASS = {
    "same-domain": "badge-done",
    analogy: "badge-doing",
    "user-specified": "badge-review",
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    loadLoopsConfig().then((config) => {
      const resolved = resolveLoop(config);
      setupLoopSwitcher(resolved.loops, resolved.selectedId);
      renderCurrentLoopName(resolved.selectedLoop && resolved.selectedLoop.name);
      loadState(resolved.statePath);
      loadRoadmap(resolved.selectedLoop && resolved.selectedLoop.roadmapPath);
    });
  }

  // Fetches loops.json. Returns the parsed config, or null if the file is
  // missing/unreadable/malformed so callers can fall back to legacy
  // single-loop behavior.
  function loadLoopsConfig() {
    return fetch(LOOPS_CONFIG_URL, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((json) => {
        if (!json || !Array.isArray(json.loops) || json.loops.length === 0) {
          throw new Error("loops.json is malformed (missing loops[])");
        }
        return json;
      })
      .catch(() => null);
  }

  // Picks which loop to display: ?loop=<id> query param, else
  // config.defaultLoop, else the first entry. Falls back to the legacy
  // fixed state path when loops.json itself is unavailable.
  function resolveLoop(config) {
    if (!config) {
      return {
        loops: [],
        selectedId: null,
        selectedLoop: null,
        statePath: LEGACY_STATE_URL,
      };
    }

    const params = new URLSearchParams(window.location.search);
    const queryLoopId = params.get("loop");
    const loops = config.loops;

    let selected =
      (queryLoopId && loops.find((l) => l.id === queryLoopId)) ||
      loops.find((l) => l.id === config.defaultLoop) ||
      loops[0];

    return {
      loops: loops,
      selectedId: selected.id,
      selectedLoop: selected,
      statePath: selected.statePath,
    };
  }

  function setupLoopSwitcher(loops, selectedId) {
    const select = document.getElementById("loop-select");
    if (!select) return;

    if (!loops || loops.length <= 1) {
      select.hidden = true;
      return;
    }

    select.innerHTML = "";
    loops.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name || l.id;
      if (l.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
    select.hidden = false;

    select.addEventListener("change", () => {
      const params = new URLSearchParams(window.location.search);
      params.set("loop", select.value);
      window.location.search = params.toString();
    });
  }

  function renderCurrentLoopName(name) {
    const el = document.getElementById("current-loop-name");
    if (!el) return;
    if (name) {
      el.textContent = name;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function loadState(statePath) {
    fetch(statePath, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " " + res.statusText);
        }
        return res.json();
      })
      .then((state) => render(state))
      .catch((err) => showLoadError(err, statePath));
  }

  function showLoadError(err, statePath) {
    const resolvedUrl = new URL(statePath, window.location.href).href;
    const el = document.getElementById("load-error");
    el.hidden = false;
    el.textContent =
      "状態データの読み込みに失敗しました(" +
      (err && err.message ? err.message : String(err)) +
      ")。試したパス: " +
      statePath +
      "(解決後: " +
      resolvedUrl +
      ")。ファイルが存在するか確認してください。";
    document.getElementById("last-updated").textContent = "最終更新: 取得失敗";
  }

  // Roadmap section: entirely optional. If the loop has no roadmapPath, or
  // the file is missing/malformed, the section simply stays hidden — this
  // must never surface an error or break the rest of the dashboard.
  function loadRoadmap(roadmapPath) {
    const section = document.getElementById("roadmap-section");
    if (!section) return;
    if (!roadmapPath) {
      section.hidden = true;
      return;
    }
    fetch(roadmapPath, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((roadmap) => {
        if (!isValidRoadmap(roadmap)) {
          throw new Error("roadmap.json is malformed");
        }
        renderRoadmap(roadmap);
        section.hidden = false;
      })
      .catch(() => {
        section.hidden = true;
      });
  }

  function isValidRoadmap(roadmap) {
    return Boolean(
      roadmap &&
        typeof roadmap.request === "string" &&
        roadmap.constraints &&
        roadmap.typeSelection &&
        Array.isArray(roadmap.steps)
    );
  }

  function renderRoadmap(roadmap) {
    document.getElementById("roadmap-request-text").textContent =
      roadmap.request || "—";

    const type = roadmap.typeSelection || {};
    document.getElementById("roadmap-type-name").textContent =
      type.name || type.catalogId || "型未選択";

    const confEl = document.getElementById("roadmap-type-confidence");
    if (type.confidence) {
      confEl.hidden = false;
      confEl.className =
        "badge " + (CONFIDENCE_BADGE_CLASS[type.confidence] || "badge-todo");
      confEl.textContent = CONFIDENCE_LABEL[type.confidence] || type.confidence;
    } else {
      confEl.hidden = true;
    }

    renderRoadmapQuestions(roadmap.constraints && roadmap.constraints.openQuestions);
    renderRoadmapReferences(roadmap.references);
    renderRoadmapSteps(roadmap.steps);
    renderRoadmapFallbackNote(roadmap.meta && roadmap.meta.fallbacks);
  }

  function renderRoadmapQuestions(openQuestions) {
    const list = document.getElementById("roadmap-questions");
    list.innerHTML = "";
    const open = (openQuestions || []).filter((q) => q.status === "open");
    if (open.length === 0) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    open.forEach((q) => {
      const li = document.createElement("li");
      li.className = "roadmap-question-card";

      const label = document.createElement("span");
      label.className = "roadmap-question-label";
      label.textContent = "未回答";
      li.appendChild(label);

      const text = document.createElement("span");
      text.className = "roadmap-question-text";
      text.textContent = q.question;
      li.appendChild(text);

      list.appendChild(li);
    });
  }

  // References section: like the roadmap section itself, this must degrade
  // gracefully. If `references` is missing or every entry is malformed, the
  // whole block simply stays hidden instead of throwing or showing partial
  // junk.
  function isValidReference(ref) {
    return Boolean(
      ref &&
        typeof ref === "object" &&
        typeof ref.kind === "string" &&
        ref.source &&
        typeof ref.source.ref === "string" &&
        ref.source.ref
    );
  }

  function renderRoadmapReferences(references) {
    const section = document.getElementById("roadmap-references-section");
    const list = document.getElementById("roadmap-references");
    if (!section || !list) return;
    list.innerHTML = "";

    const valid = Array.isArray(references) ? references.filter(isValidReference) : [];
    if (valid.length === 0) {
      section.hidden = true;
      return;
    }

    valid.forEach((ref) => {
      list.appendChild(buildReferenceCard(ref));
    });
    section.hidden = false;
  }

  function buildReferenceCard(ref) {
    const li = document.createElement("li");
    li.className = "roadmap-reference";

    const details = document.createElement("details");

    const summary = document.createElement("summary");

    const kindBadge = document.createElement("span");
    kindBadge.className = "badge " + (REFERENCE_KIND_BADGE_CLASS[ref.kind] || "badge-todo");
    kindBadge.textContent = REFERENCE_KIND_LABEL[ref.kind] || ref.kind;
    summary.appendChild(kindBadge);

    const noteText = document.createElement("span");
    noteText.className = "roadmap-reference-note";
    noteText.textContent = (ref.source && ref.source.note) || ref.source.ref;
    summary.appendChild(noteText);

    details.appendChild(summary);
    details.appendChild(buildReferenceBody(ref));
    li.appendChild(details);
    return li;
  }

  function buildReferenceBody(ref) {
    const body = document.createElement("div");
    body.className = "roadmap-reference-body";

    const sourceWrap = document.createElement("div");
    sourceWrap.className = "roadmap-field";
    const sourceLabel = document.createElement("div");
    sourceLabel.className = "roadmap-field-label";
    sourceLabel.textContent = "出典";
    sourceWrap.appendChild(sourceLabel);
    const sourceP = document.createElement("p");
    const a = document.createElement("a");
    a.href = ref.source.ref;
    a.textContent = ref.source.ref;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    sourceP.appendChild(a);
    sourceWrap.appendChild(sourceP);
    body.appendChild(sourceWrap);

    if (Array.isArray(ref.essence) && ref.essence.length > 0) {
      const wrap = document.createElement("div");
      wrap.className = "roadmap-field";
      const label = document.createElement("div");
      label.className = "roadmap-field-label";
      label.textContent = "らしさ(trait ← why)";
      wrap.appendChild(label);
      const ul = document.createElement("ul");
      ul.className = "plain-list";
      ref.essence.forEach((e) => {
        if (!e) return;
        const item = document.createElement("li");
        item.textContent = (e.trait || "") + " ← " + (e.why || "");
        ul.appendChild(item);
      });
      wrap.appendChild(ul);
      body.appendChild(wrap);
    }

    if (Array.isArray(ref.transfer) && ref.transfer.length > 0) {
      const wrap = document.createElement("div");
      wrap.className = "roadmap-field";
      const label = document.createElement("div");
      label.className = "roadmap-field-label";
      label.textContent = "転換(反映先の工程)";
      wrap.appendChild(label);
      const ul = document.createElement("ul");
      ul.className = "plain-list";
      ref.transfer.forEach((t) => {
        if (!t) return;
        const item = document.createElement("li");
        item.textContent = "[" + (t.toStepId || "?") + "] " + (t.instruction || "");
        ul.appendChild(item);
      });
      wrap.appendChild(ul);
      body.appendChild(wrap);
    }

    return body;
  }

  function renderRoadmapSteps(steps) {
    const list = document.getElementById("roadmap-steps");
    list.innerHTML = "";
    (steps || []).forEach((step) => {
      list.appendChild(buildRoadmapStepCard(step, steps));
    });
  }

  function buildRoadmapStepCard(step, allSteps) {
    const details = document.createElement("details");
    details.className = "roadmap-step";

    const summary = document.createElement("summary");

    const title = document.createElement("span");
    title.className = "roadmap-step-title";
    title.textContent = step.title || step.id;
    summary.appendChild(title);

    if (step.freshness) {
      const fBadge = document.createElement("span");
      fBadge.className =
        "badge " + (FRESHNESS_BADGE_CLASS[step.freshness] || "freshness-stable");
      fBadge.textContent = FRESHNESS_LABEL[step.freshness] || step.freshness;
      summary.appendChild(fBadge);
    }

    if (step.owner) {
      const oBadge = document.createElement("span");
      oBadge.className = "badge roadmap-owner-badge";
      oBadge.textContent = OWNER_LABEL[step.owner] || step.owner;
      summary.appendChild(oBadge);
    }

    if (step.dependsOn && step.dependsOn.length > 0) {
      const dep = document.createElement("span");
      dep.className = "roadmap-step-depends";
      dep.textContent = "← " + step.dependsOn.join("・") + "の後";
      summary.appendChild(dep);
    }

    details.appendChild(summary);
    details.appendChild(buildRoadmapStepBody(step));
    return details;
  }

  function buildRoadmapStepBody(step) {
    const body = document.createElement("div");
    body.className = "roadmap-step-body";

    appendRoadmapField(body, "目的", step.purpose);
    appendRoadmapListField(body, "成果物", step.deliverables);
    appendRoadmapListField(body, "完了条件", step.doneCriteria);
    appendRoadmapListField(body, "注意", step.cautions);

    if (step.risks && step.risks.length > 0) {
      const wrap = document.createElement("div");
      wrap.className = "roadmap-field";
      const label = document.createElement("div");
      label.className = "roadmap-field-label";
      label.textContent = "リスク → プランB";
      wrap.appendChild(label);
      const ul = document.createElement("ul");
      ul.className = "plain-list";
      step.risks.forEach((r) => {
        const li = document.createElement("li");
        li.textContent = (r.risk || "") + " → " + (r.fallback || "未定");
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      body.appendChild(wrap);
    }

    if (
      step.research &&
      Array.isArray(step.research.sources) &&
      step.research.sources.length > 0
    ) {
      const wrap = document.createElement("div");
      wrap.className = "roadmap-field";
      const label = document.createElement("div");
      label.className = "roadmap-field-label";
      label.textContent = "出典";
      wrap.appendChild(label);
      const ul = document.createElement("ul");
      ul.className = "plain-list";
      step.research.sources.forEach((s) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = s.url;
        a.textContent = s.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.appendChild(a);
        if (s.note) {
          li.appendChild(document.createTextNode(" — " + s.note));
        }
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      body.appendChild(wrap);
    }

    return body;
  }

  function appendRoadmapField(container, label, text) {
    if (!text) return;
    const wrap = document.createElement("div");
    wrap.className = "roadmap-field";
    const labelEl = document.createElement("div");
    labelEl.className = "roadmap-field-label";
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
    const p = document.createElement("p");
    p.textContent = text;
    wrap.appendChild(p);
    container.appendChild(wrap);
  }

  function appendRoadmapListField(container, label, items) {
    if (!items || items.length === 0) return;
    const wrap = document.createElement("div");
    wrap.className = "roadmap-field";
    const labelEl = document.createElement("div");
    labelEl.className = "roadmap-field-label";
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
    const ul = document.createElement("ul");
    ul.className = "plain-list";
    items.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    container.appendChild(wrap);
  }

  function renderRoadmapFallbackNote(fallbacks) {
    const el = document.getElementById("roadmap-fallback-note");
    if (!fallbacks || fallbacks.length === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = fallbacks
      .map(
        (f) =>
          "段階" + f.stage + "で" + f.from + "→" + f.to + "フォールバック発生" +
          (f.reason ? "(" + f.reason + ")" : "")
      )
      .join(" / ");
  }

  function render(state) {
    renderHeader(state);
    renderGoal(state.goal);
    renderDiff(state.changes, state.tasks);
    renderKanban(state.tasks);
    renderBottlenecks(state.bottlenecks, state.tasks);
    renderErrors(state.errors, state.tasks);
    renderSkillsAndLessons(state.skills, state.lessons);
    renderRecommendations(state.recommendations);
  }

  function renderHeader(state) {
    const el = document.getElementById("last-updated");
    const updated = formatDateTime(state.updatedAt);
    const prev = formatDateTime(state.previousRunAt);
    el.textContent =
      "最終更新: " + updated + (prev ? "(前回: " + prev + ")" : "");
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return mm + "/" + dd + " " + hh + ":" + min;
  }

  function renderGoal(goal) {
    if (!goal) return;
    document.getElementById("goal-text").textContent = goal.text || "—";

    const pct = Math.round(clamp01(goal.progress) * 100);
    const fill = document.getElementById("goal-progress-fill");
    fill.style.width = pct + "%";
    const track = document.getElementById("goal-progress");
    track.setAttribute("aria-valuenow", String(pct));
    document.getElementById("goal-progress-label").textContent =
      "進捗 " + pct + "%";

    const list = document.getElementById("goal-stop-conditions");
    list.innerHTML = "";
    (goal.stopConditions || []).forEach((cond) => {
      const li = document.createElement("li");
      li.textContent = cond;
      list.appendChild(li);
    });
  }

  function clamp01(n) {
    n = Number(n) || 0;
    return Math.max(0, Math.min(1, n));
  }

  function taskById(tasks, id) {
    return (tasks || []).find((t) => t.id === id);
  }

  function renderDiff(changes, tasks) {
    const list = document.getElementById("diff-list");
    list.innerHTML = "";
    if (!changes || changes.length === 0) {
      const li = document.createElement("li");
      li.className = "diff-empty";
      li.textContent = "前回から変化はありません。";
      list.appendChild(li);
      return;
    }

    changes.forEach((change) => {
      const task = taskById(tasks, change.taskId);
      const li = document.createElement("li");

      const badge = document.createElement("span");
      const toStatus = change.to || (task && task.status) || "todo";
      badge.className = "badge badge-" + toStatus;
      badge.textContent = STATUS_LABEL[toStatus] || toStatus;

      const body = document.createElement("div");
      body.className = "diff-body";

      const title = document.createElement("div");
      title.className = "diff-title";
      title.textContent = (task && task.title) || change.taskId;
      body.appendChild(title);

      if (change.from && change.to && change.from !== change.to) {
        const transition = document.createElement("div");
        transition.className = "diff-transition";
        transition.textContent =
          (STATUS_LABEL[change.from] || change.from) +
          " → " +
          (STATUS_LABEL[change.to] || change.to);
        body.appendChild(transition);
      }

      if (change.note) {
        const note = document.createElement("div");
        note.className = "diff-note";
        note.textContent = change.note;
        body.appendChild(note);
      }

      li.appendChild(badge);
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  function renderKanban(tasks) {
    const board = document.getElementById("kanban-board");
    board.innerHTML = "";
    tasks = tasks || [];

    KANBAN_COLUMNS.forEach((status) => {
      const column = document.createElement("div");
      column.className = "kanban-column";

      const header = document.createElement("div");
      header.className = "kanban-column-header";

      const title = document.createElement("span");
      title.className = "kanban-column-title";
      title.textContent = STATUS_LABEL[status];

      const colTasks = tasks.filter((t) => t.status === status);

      const count = document.createElement("span");
      count.className = "kanban-column-count";
      count.textContent = String(colTasks.length);

      header.appendChild(title);
      header.appendChild(count);
      column.appendChild(header);

      if (colTasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "kanban-empty";
        empty.textContent = "なし";
        column.appendChild(empty);
      } else {
        colTasks.forEach((task) => {
          column.appendChild(buildTaskCard(task, tasks));
        });
      }

      board.appendChild(column);
    });
  }

  function buildTaskCard(task, allTasks) {
    const details = document.createElement("details");
    details.className = "task-card";

    const summary = document.createElement("summary");
    summary.textContent = task.title;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "task-card-body";

    if (task.summary) {
      const p = document.createElement("p");
      p.textContent = task.summary;
      body.appendChild(p);
    }

    const meta = document.createElement("div");
    meta.className = "task-meta";

    const skillSpan = document.createElement("span");
    skillSpan.textContent = "スキル: " + (task.skill || "—");
    meta.appendChild(skillSpan);

    const durSpan = document.createElement("span");
    durSpan.textContent = "所要: " + formatDuration(task.durationMs);
    meta.appendChild(durSpan);

    const retrySpan = document.createElement("span");
    retrySpan.textContent = "リトライ: " + (task.retries || 0) + "回";
    meta.appendChild(retrySpan);

    if (task.dependsOn && task.dependsOn.length > 0) {
      const depNames = task.dependsOn
        .map((id) => {
          const dep = taskById(allTasks, id);
          return dep ? dep.title : id;
        })
        .join(", ");
      const depSpan = document.createElement("span");
      depSpan.textContent = "依存: " + depNames;
      meta.appendChild(depSpan);
    }

    body.appendChild(meta);
    details.appendChild(body);
    return details;
  }

  function formatDuration(ms) {
    if (!ms || ms <= 0) return "—";
    if (ms < 1000) return ms + "ms";
    const seconds = ms / 1000;
    if (seconds < 60) return seconds.toFixed(seconds < 10 ? 1 : 0) + "秒";
    const minutes = Math.floor(seconds / 60);
    const remSeconds = Math.round(seconds % 60);
    return minutes + "分" + (remSeconds ? remSeconds + "秒" : "");
  }

  function renderBottlenecks(bottlenecks, tasks) {
    const list = document.getElementById("bottleneck-list");
    list.innerHTML = "";
    if (!bottlenecks || bottlenecks.length === 0) {
      list.appendChild(makeEmptyItem("現在ボトルネックはありません。"));
      return;
    }

    bottlenecks.forEach((b) => {
      const task = taskById(tasks, b.taskId);
      const li = document.createElement("li");
      li.className = "severity-" + (b.severity || "medium");

      const head = document.createElement("div");
      head.className = "item-head";

      const title = document.createElement("span");
      title.className = "item-title";
      title.textContent = (task && task.title) || b.taskId;
      head.appendChild(title);

      const sevBadge = document.createElement("span");
      const sev =
        b.severity === "high"
          ? { cls: "error", label: "重度" }
          : b.severity === "low"
            ? { cls: "todo", label: "軽度" }
            : { cls: "review", label: "中度" };
      sevBadge.className = "badge badge-" + sev.cls;
      sevBadge.textContent = sev.label;
      head.appendChild(sevBadge);

      li.appendChild(head);

      const reason = document.createElement("div");
      reason.textContent = b.reason;
      li.appendChild(reason);

      list.appendChild(li);
    });
  }

  function renderErrors(errors, tasks) {
    const list = document.getElementById("error-list");
    list.innerHTML = "";
    if (!errors || errors.length === 0) {
      list.appendChild(makeEmptyItem("現在エラーはありません。"));
      return;
    }

    errors.forEach((e) => {
      const task = taskById(tasks, e.taskId);
      const li = document.createElement("li");
      li.className = "severity-high error-card";

      const head = document.createElement("div");
      head.className = "item-head";
      const title = document.createElement("span");
      title.className = "item-title";
      title.textContent = (task && task.title) || e.taskId;
      head.appendChild(title);
      li.appendChild(head);

      const message = document.createElement("div");
      message.textContent = e.message;
      li.appendChild(message);

      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "原因・対処を見る";
      details.appendChild(summary);

      if (e.cause) {
        const cause = document.createElement("p");
        cause.className = "error-card-cause";
        cause.innerHTML = "<strong>原因: </strong>";
        cause.appendChild(document.createTextNode(e.cause));
        details.appendChild(cause);
      }

      if (e.action) {
        const action = document.createElement("p");
        action.className = "error-card-action";
        action.innerHTML = "<strong>対処状況: </strong>";
        action.appendChild(document.createTextNode(e.action));
        details.appendChild(action);
      }

      li.appendChild(details);
      list.appendChild(li);
    });
  }

  function makeEmptyItem(text) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.style.border = "none";
    li.style.padding = "2px 0";
    li.textContent = text;
    return li;
  }

  function renderSkillsAndLessons(skills, lessons) {
    const skillList = document.getElementById("skills-list");
    skillList.innerHTML = "";
    (skills || []).forEach((s) => {
      const li = document.createElement("li");
      li.className = "skill-chip";

      const dot = document.createElement("span");
      dot.className = "skill-result-dot skill-result-" + (s.lastResult || "success");
      li.appendChild(dot);

      const name = document.createElement("span");
      name.className = "skill-name";
      name.textContent = s.name;
      li.appendChild(name);

      const uses = document.createElement("span");
      uses.className = "skill-uses";
      uses.textContent =
        s.uses + "回 / " + (SKILL_RESULT_LABEL[s.lastResult] || s.lastResult || "");
      li.appendChild(uses);

      skillList.appendChild(li);
    });
    if (!skills || skills.length === 0) {
      skillList.appendChild(makeEmptyItem("適用されたスキルはまだありません。"));
    }

    const lessonList = document.getElementById("lessons-list");
    lessonList.innerHTML = "";
    (lessons || []).forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      lessonList.appendChild(li);
    });
    if (!lessons || lessons.length === 0) {
      lessonList.appendChild(makeEmptyItem("まだ記録された教訓はありません。"));
    }
  }

  function renderRecommendations(recs) {
    const list = document.getElementById("recommendations-list");
    list.innerHTML = "";
    if (!recs || recs.length === 0) {
      list.appendChild(makeEmptyItem("現在のおすすめはありません。"));
      return;
    }

    recs.forEach((r) => {
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "item-head";

      const typeBadge = document.createElement("span");
      typeBadge.className = "rec-type";
      typeBadge.textContent = REC_TYPE_LABEL[r.type] || r.type;
      head.appendChild(typeBadge);

      li.appendChild(head);

      const text = document.createElement("div");
      text.textContent = r.text;
      li.appendChild(text);

      list.appendChild(li);
    });
  }
})();
