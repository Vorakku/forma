import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";

test("3D libraries stay lazy; the product viewer never loads face tracking or WASM", async () => {
  const result = await build({ logLevel: "silent", build: { write: false } }),
    output = (Array.isArray(result) ? result : [result]).flatMap(
      (bundle) => bundle.output,
    );
  const chunks = output.filter((item) => item.type === "chunk"),
    entry = chunks.find((chunk) => chunk.isEntry),
    route = chunks.find((chunk) =>
      Object.keys(chunk.modules).some((id) =>
        id.replaceAll("\\", "/").endsWith("/src/pages/try-on.tsx"),
      ),
    );
  const viewer = chunks.find((chunk) =>
    Object.keys(chunk.modules).some((id) =>
      id.replaceAll("\\", "/").endsWith("/src/components/product-3d.tsx"),
    ),
  );
  assert.ok(entry);
  assert.ok(route);
  assert.ok(viewer);
  const scroll = chunks.find((chunk) =>
    Object.keys(chunk.modules).some((id) =>
      id.replaceAll("\\", "/").endsWith("/src/pages/v2-demo.tsx"),
    ),
  );
  assert.ok(scroll);
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const reachable = (root, dynamic = false) => {
    const found = new Set();
    const visit = (chunk) => {
      if (!chunk || found.has(chunk)) return;
      found.add(chunk);
      for (const name of [
        ...chunk.imports,
        ...(dynamic ? chunk.dynamicImports : []),
      ])
        visit(byName.get(name));
    };
    visit(root);
    return found;
  };
  const core = reachable(entry),
    lazy = reachable(route),
    display = reachable(viewer),
    demo = reachable(scroll),
    all = reachable(entry, true),
    owns = (chunk, library) =>
      Object.keys(chunk.modules).some((id) =>
        id.replaceAll("\\", "/").includes("/node_modules/" + library + "/"),
      );
  assert.ok(!core.has(route), "try-on must be dynamically imported");
  assert.ok(all.has(route), "the app must expose the lazy route");
  for (const library of ["three", "@mediapipe/tasks-vision"]) {
    assert.ok(
      [...lazy].some((chunk) => owns(chunk, library)),
      library + " must be in the try-on dependency graph",
    );
    assert.ok(
      ![...core].some((chunk) => owns(chunk, library)),
      library + " must stay out of the app entry",
    );
    assert.ok(
      chunks
        .filter((chunk) => owns(chunk, library))
        .every(
          (chunk) =>
            lazy.has(chunk) ||
            (library === "three" && (display.has(chunk) || demo.has(chunk))),
        ),
      library + " must not escape the lazy 3D views",
    );
  }
  for (const library of ["gsap", "@gsap/react"]) {
    assert.ok([...demo].some((chunk) => owns(chunk, library)));
    assert.ok(
      ![...core, ...display, ...lazy].some((chunk) => owns(chunk, library)),
      library + " stays on /v2-demo",
    );
  }
  assert.ok(
    ![...demo].some((chunk) =>
      Object.keys(chunk.modules).some((id) => id.includes("OrbitControls")),
    ),
    "scroll uses no OrbitControls",
  );
  assert.ok(!core.has(scroll));
  assert.ok(all.has(scroll));
  assert.ok(!core.has(viewer));
  assert.ok(all.has(viewer));
  assert.ok([...display].some((chunk) => owns(chunk, "three")));
  assert.ok(
    ![...display].some((chunk) => owns(chunk, "@mediapipe/tasks-vision")),
    "a 3D product view must not load tracking",
  );
  assert.ok(
    ![...display].some(
      (chunk) =>
        chunk.code.includes("vision_wasm_internal") ||
        chunk.code.includes("face_landmarker.task"),
    ),
    "a 3D product view must not load the face model/WASM",
  );
  for (const extension of ["js", "wasm"])
    assert.ok(
      output.some(
        (item) =>
          item.type === "asset" &&
          new RegExp("vision_wasm_internal-.*\\." + extension + "$").test(
            item.fileName,
          ),
      ),
      "the " + extension + " runtime must be self-hosted",
    );
  const html = output.find((item) => item.fileName === "index.html");
  assert.ok(html);
  assert.ok(
    !String(html.source).includes(route.fileName),
    "the HTML must not preload try-on",
  );
  assert.ok(
    !String(html.source).includes(viewer.fileName),
    "the HTML must not preload the product viewer",
  );
});
