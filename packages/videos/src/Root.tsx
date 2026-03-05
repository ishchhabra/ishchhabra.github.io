import { Composition } from "remotion";
import { CmdClickBefore, CmdClickAfter } from "./CmdClick";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="CmdClickBefore"
        component={CmdClickBefore}
        durationInFrames={150} // 5s at 30fps
        fps={30}
        width={960}
        height={540}
      />
      <Composition
        id="CmdClickAfter"
        component={CmdClickAfter}
        durationInFrames={150} // 5s at 30fps
        fps={30}
        width={960}
        height={540}
      />
    </>
  );
}
