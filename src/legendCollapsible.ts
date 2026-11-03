const GROUP_PICTOS: Record<string, string> = {
  country: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#f8f8f8" stroke-width="1.5"/>
      <path d="M3 12h18M12 3c2.5 2.8 3.8 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-3.8 6-4 9s1.5 6.2 4 9" stroke="#f8f8f8" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  `,
  networks: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h6v5H4V6zm10 0h6v5h-6V6zM4 13h6v5H4v-5zm10 0h6v5h-6v-5z" stroke="#f8f8f8" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `,
};

const CHEVRON_ICON = `
  <svg class="o-legend-group-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export function createCollapsibleGroup(
  parent: HTMLElement,
  options: { key: string; title: string; startOpen?: boolean }
): { groupBody: HTMLDivElement } {
  const groupSection = document.createElement("section");
  groupSection.className = "o-legend-group";
  groupSection.dataset.group = options.key;

  const groupHeader = document.createElement("button");
  groupHeader.type = "button";
  groupHeader.className = "o-legend-group-header";
  groupHeader.setAttribute("aria-expanded", String(options.startOpen ?? false));
  groupHeader.innerHTML = `
    <span class="o-legend-group-picto">${GROUP_PICTOS[options.key] ?? ""}</span>
    <span class="o-legend-group-title">${options.title}</span>
    ${CHEVRON_ICON}
  `;

  const groupBody = document.createElement("div");
  groupBody.className = "o-legend-group-body";

  groupHeader.addEventListener("click", () => {
    const open = groupSection.classList.toggle("open");
    groupHeader.setAttribute("aria-expanded", String(open));
  });

  groupSection.append(groupHeader, groupBody);
  parent.appendChild(groupSection);

  if (options.startOpen) {
    groupSection.classList.add("open");
  }

  return { groupBody };
}
