import { getNodeDefaults } from "../components/nodes/nodeRegistry";

const PAD_X      = 80;
const PAD_BOTTOM = 60;
const MIN_W      = 300;
const MIN_H      = 80;

export function autoResizeContainer(nodes) {
    const containers = nodes.filter(n => n.type === "workflowcontainer");
    if (!containers.length) return nodes;

    let result = nodes;

    for (const container of containers) {
        if (container.data?.minimized) continue;

        const curW = container.style?.width  ?? 760;
        const curH = container.style?.height ?? 340;

        const children = result.filter(n =>
            n.type !== "workflowcontainer" &&
            n.type !== "section" &&
            (n.parentId === container.id ||
             (containers.length === 1 && !n.parentId && n.type !== "section"))
        );

        if (!children.length) continue;

        let maxRight  = MIN_W;
        let maxBottom = 0;

        children.forEach(n => {
            const reg = getNodeDefaults(n.type) || {};
            const nw = n.style?.width  ?? n.measured?.width  ?? reg.width  ?? 58;
            const nh = n.style?.height ?? n.measured?.height ?? reg.height ?? 58;
            const relX = n.parentId === container.id
                ? n.position.x
                : n.position.x - container.position.x;
            const relY = n.parentId === container.id
                ? n.position.y
                : n.position.y - container.position.y;
            maxRight  = Math.max(maxRight,  relX + nw);
            maxBottom = Math.max(maxBottom, relY + nh);
        });

        const newW = Math.max(maxRight + PAD_X, MIN_W, curW);
        const newH = Math.max(maxBottom + PAD_BOTTOM, MIN_H, curH);

        if (newW !== curW || newH !== curH) {
            result = result.map(n =>
                n.id === container.id
                    ? { ...n, style: { ...n.style, width: newW, height: newH } }
                    : n
            );
        }
    }

    return result;
}
