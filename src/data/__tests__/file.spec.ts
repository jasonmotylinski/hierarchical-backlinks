import { describe, expect, it } from "vitest";

import { File } from "../file";
import type { App, TFile } from "obsidian";
import type { BacklinkReference } from "../../types";

describe("File.getReferences", () => {
  it("preserves full frontmatter key paths", async () => {
    const file = new File({} as App, {} as TFile);

    const references = await file.getReferences("note.md", [
      {
        key: "test.children",
        original: "[[testme8]]",
        position: undefined as any,
      } as BacklinkReference,
    ]);

    expect(references).toHaveLength(1);
    const property = references[0].properties[0];
    expect(property.key).toBe("test.children");
    expect(property.subkey).toEqual(["children"]);
  });
});
