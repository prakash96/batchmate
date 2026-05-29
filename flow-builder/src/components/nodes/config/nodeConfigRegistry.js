import { NODE_METADATA } from '../../../nodeMetadata';
import GenericConfig from './GenericConfig';
import WorkflowContainerConfig from './WorkflowContainerConfig';

export const nodeConfigRegistry = {
    workflowcontainer: WorkflowContainerConfig,
    ...Object.fromEntries(
        NODE_METADATA
            .filter(m => m.sections)
            .map(m => [m.type, GenericConfig])
    ),
};
