import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "image-editor",
  name: "Image Editor",
  description:
    "Edit photos and images in layers in the browser, and keep the documents in a private library.",
  icon: "/icon.svg",
  resources: {
    d1: ["DB"],
    r2: ["files"],
  },
});
