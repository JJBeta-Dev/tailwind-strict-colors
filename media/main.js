(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");
  const searchInput = document.getElementById("search");

  let payload = { files: [], themeTokenCount: 1, themeFileGlob: "" };
  let filterText = "";
  const collapsed = new Set(vscode.getState()?.collapsed ?? []);

  function persistState() {
    vscode.setState({ collapsed: [...collapsed] });
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function issueHtml(file, issue) {
    const openPayload = JSON.stringify({
      uriString: file.uriString,
      startLine: issue.startLine,
      startChar: issue.startChar,
      endLine: issue.endLine,
      endChar: issue.endChar,
    });
    return `
      <div class="issue-row" data-open='${escapeHtml(openPayload)}'>
        <span class="codicon codicon-warning"></span>
        <span class="issue-class">${escapeHtml(issue.text)}</span>
        <span class="issue-loc">Ln ${issue.startLine + 1}, Col ${issue.startChar + 1}</span>
      </div>`;
  }

  function fileHtml(file) {
    const isCollapsed = collapsed.has(file.uriString);
    return `
      <div class="file-group ${isCollapsed ? "collapsed" : ""}">
        <div class="file-header" data-toggle="${escapeHtml(file.uriString)}">
          <span class="codicon codicon-chevron-down"></span>
          <span class="codicon codicon-file"></span>
          <span class="file-name">${escapeHtml(file.baseName)}</span>
          <span class="file-path" title="${escapeHtml(file.dirPath)}">${escapeHtml(file.dirPath)}</span>
          <span class="badge">${file.issues.length}</span>
        </div>
        <div class="issue-list">${file.issues.map((issue) => issueHtml(file, issue)).join("")}</div>
      </div>`;
  }

  function themeWarningHtml() {
    if (payload.themeTokenCount > 0) return "";
    return `
      <div class="theme-warning">
        <span class="codicon codicon-warning"></span>
        <span>No se encontró tu @theme (glob "${escapeHtml(payload.themeFileGlob)}"). Sin tokens, no hay sugerencias de reemplazo.</span>
      </div>`;
  }

  function emptyStateHtml() {
    return `
      <div class="empty-state">
        <span class="codicon codicon-pass-filled"></span>
        <div>No se encontraron colores quemados en el proyecto.</div>
      </div>`;
  }

  function render() {
    const warningBanner = themeWarningHtml();

    if (payload.files.length === 0) {
      root.innerHTML = warningBanner + emptyStateHtml();
      return;
    }

    const query = filterText.trim().toLowerCase();
    const visibleFiles = payload.files
      .map((file) => ({
        ...file,
        issues: query
          ? file.issues.filter(
              (issue) =>
                issue.text.toLowerCase().includes(query) ||
                file.baseName.toLowerCase().includes(query) ||
                file.dirPath.toLowerCase().includes(query)
            )
          : file.issues,
      }))
      .filter((file) => file.issues.length > 0);

    if (visibleFiles.length === 0) {
      root.innerHTML = warningBanner + `<div class="summary">Sin resultados para "${escapeHtml(filterText)}"</div>`;
      return;
    }

    const totalIssues = visibleFiles.reduce((sum, file) => sum + file.issues.length, 0);
    root.innerHTML =
      warningBanner +
      `<div class="summary">${totalIssues} color${totalIssues === 1 ? "" : "es"} quemado${totalIssues === 1 ? "" : "s"} en ${visibleFiles.length} archivo${visibleFiles.length === 1 ? "" : "s"}</div>` +
      visibleFiles.map(fileHtml).join("");

    root.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-toggle");
        if (collapsed.has(key)) collapsed.delete(key);
        else collapsed.add(key);
        persistState();
        render();
      });
    });

    root.querySelectorAll("[data-open]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const openPayload = JSON.parse(el.getAttribute("data-open"));
        vscode.postMessage({ type: "open", ...openPayload });
      });
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "update") {
      payload = message.payload;
      render();
    }
  });

  searchInput.addEventListener("input", (event) => {
    filterText = event.target.value;
    render();
  });

  vscode.postMessage({ type: "ready" });
})();
