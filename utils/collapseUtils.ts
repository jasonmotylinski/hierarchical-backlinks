export function collapseLeafMatchBlocks(root: HTMLElement) {
  const treeItems = root.querySelectorAll(".tree-item");

  console.debug("[CollapseUtils] Collapsing from", root);
  console.debug("[CollapseUtils] Found tree items:", treeItems.length);

  treeItems.forEach(item => {
    const hasMatches = item.querySelector(":scope > .search-result-file-matches");
    const children = item.querySelector(":scope > .tree-item-children");
    const isLeaf = hasMatches && (!children || children.querySelectorAll(":scope > .tree-item").length === 0);

    console.debug("[CollapseUtils] Checking tree item:", item);
    console.debug("[CollapseUtils]   hasMatches:", !!hasMatches, "| hasChildren:", !!children);
    console.debug("[CollapseUtils]   isLeaf:", isLeaf);

    if (isLeaf) {
      const matchBlock = item.querySelector(":scope > .search-result-file-matches");
      const self = item.querySelector(".tree-item-self");

      if (matchBlock) {
        console.debug("[CollapseUtils] Toggling visibility of matchBlock:", matchBlock);
        matchBlock.classList.toggle("is-hidden");
      }

      if (self) {
        console.debug("[CollapseUtils] Toggling is-collapsed on self:", self);
        self.classList.toggle("is-collapsed");
      }
    }
  });
}