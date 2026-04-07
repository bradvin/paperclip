import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensurePaperclipSkillSymlink,
  isLikelyPaperclipSkillSource,
  listPaperclipSkillEntries,
  removeMaintainerOnlySkillSymlinks,
} from "@paperclipai/adapter-utils/server-utils";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("paperclip skill utils", () => {
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("lists runtime skills from ./skills without pulling in .agents/skills", async () => {
    const root = await makeTempDir("paperclip-skill-roots-");
    cleanupDirs.add(root);

    const moduleDir = path.join(root, "a", "b", "c", "d", "e");
    await fs.mkdir(moduleDir, { recursive: true });
    await fs.mkdir(path.join(root, "skills", "paperclip"), { recursive: true });
    await fs.mkdir(path.join(root, ".agents", "skills", "release"), { recursive: true });

    const entries = await listPaperclipSkillEntries(moduleDir);

    expect(entries.map((entry) => entry.name)).toEqual(["paperclip"]);
    expect(entries[0]?.source).toBe(path.join(root, "skills", "paperclip"));
  });

  it("removes stale maintainer-only symlinks from a shared skills home", async () => {
    const root = await makeTempDir("paperclip-skill-cleanup-");
    cleanupDirs.add(root);

    const skillsHome = path.join(root, "skills-home");
    const runtimeSkill = path.join(root, "skills", "paperclip");
    const customSkill = path.join(root, "custom", "release-notes");
    const staleMaintainerSkill = path.join(root, ".agents", "skills", "release");

    await fs.mkdir(skillsHome, { recursive: true });
    await fs.mkdir(runtimeSkill, { recursive: true });
    await fs.mkdir(customSkill, { recursive: true });

    await fs.symlink(runtimeSkill, path.join(skillsHome, "paperclip"));
    await fs.symlink(customSkill, path.join(skillsHome, "release-notes"));
    await fs.symlink(staleMaintainerSkill, path.join(skillsHome, "release"));

    const removed = await removeMaintainerOnlySkillSymlinks(skillsHome, ["paperclip"]);

    expect(removed).toEqual(["release"]);
    await expect(fs.lstat(path.join(skillsHome, "release"))).rejects.toThrow();
    expect((await fs.lstat(path.join(skillsHome, "paperclip"))).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(path.join(skillsHome, "release-notes"))).isSymbolicLink()).toBe(true);
  });

  it("recognizes Paperclip skills shipped from an adapter package", async () => {
    const root = await makeTempDir("paperclip-skill-package-");
    cleanupDirs.add(root);

    const packageRoot = path.join(root, "node_modules", "@paperclipai", "adapter-codex-local");
    const skillDir = path.join(packageRoot, "skills", "paperclip");

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(packageRoot, "package.json"), '{"name":"@paperclipai/adapter-codex-local"}\n', "utf8");
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: paperclip\n---\n", "utf8");

    await expect(isLikelyPaperclipSkillSource(skillDir, "paperclip")).resolves.toBe(true);
  });

  it("repairs a symlink that still points at a live adapter package skill", async () => {
    const root = await makeTempDir("paperclip-skill-repair-");
    cleanupDirs.add(root);

    const currentSkill = path.join(root, "repo", "skills", "paperclip");
    const oldPackageRoot = path.join(root, "cache", "node_modules", "@paperclipai", "adapter-codex-local");
    const oldSkill = path.join(oldPackageRoot, "skills", "paperclip");
    const target = path.join(root, "skills-home", "paperclip");

    await fs.mkdir(currentSkill, { recursive: true });
    await fs.mkdir(oldSkill, { recursive: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(path.join(currentSkill, "SKILL.md"), "---\nname: paperclip\n---\n", "utf8");
    await fs.writeFile(path.join(oldPackageRoot, "package.json"), '{"name":"@paperclipai/adapter-codex-local"}\n', "utf8");
    await fs.writeFile(path.join(oldSkill, "SKILL.md"), "---\nname: paperclip\n---\n", "utf8");
    await fs.symlink(oldSkill, target);

    await expect(ensurePaperclipSkillSymlink(currentSkill, target)).resolves.toBe("repaired");
    await expect(fs.realpath(target)).resolves.toBe(await fs.realpath(currentSkill));
  });
});
