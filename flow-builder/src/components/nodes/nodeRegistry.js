import { useMetadataStore } from '../../store/metadataStore';

export function getNodeDefaults(type) {
    const { nodeMetaMap } = useMetadataStore.getState();
    const m = nodeMetaMap[type];
    if (!m) return null;
    return { width: m.width, height: m.height, data: { ...m.defaultData } };
}
