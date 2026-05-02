import { describe, expect, it } from "vitest";
import { offsetToPosition } from "../offsetToPosition";

describe("offsetToPosition", () => {
    it("returns line 0 col 0 for offset 0", () => {
        expect(offsetToPosition("hello\nworld", 0)).toEqual({ line: 0, col: 0 });
    });

    it("counts columns on the first line", () => {
        expect(offsetToPosition("hello world", 6)).toEqual({ line: 0, col: 6 });
    });

    it("advances to the next line after a newline", () => {
        // "hello\nworld" → offset 6 is 'w' on line 1 col 0
        expect(offsetToPosition("hello\nworld", 6)).toEqual({ line: 1, col: 0 });
    });

    it("counts columns on later lines", () => {
        // "hello\nworld" → offset 9 is 'r' (3rd char on line 1)
        expect(offsetToPosition("hello\nworld", 9)).toEqual({ line: 1, col: 3 });
    });

    it("handles multiple newlines", () => {
        // "a\nb\nc" → offset 4 is 'c' on line 2 col 0
        expect(offsetToPosition("a\nb\nc", 4)).toEqual({ line: 2, col: 0 });
    });

    it("clamps offset beyond content length", () => {
        expect(offsetToPosition("hi", 100)).toEqual({ line: 0, col: 2 });
    });
});
