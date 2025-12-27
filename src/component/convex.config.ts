import { defineComponent } from "convex/server";
import actionRetrier from "@convex-dev/action-retrier/convex.config";

const component = defineComponent("convexFilesControl");

component.use(actionRetrier);

export default component;
