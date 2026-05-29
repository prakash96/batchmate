import GenericNode from "../nodes/GenericNode";
import ConditionNode from "../nodes/ConditionNode";
import IterationNode from "../nodes/IteratioNode";
import ErrorScopeNode from "../nodes/ErrorScopeNode";
import SectionNode from "../nodes/SectionNode";
import WorkflowContainerNode from "../nodes/WorkflowContainerNode";

export { GenericNode };

export const CUSTOM_NODES = {
    condition: ConditionNode,
    iteration: IterationNode,
    errorscope: ErrorScopeNode,
    section: SectionNode,
    workflowcontainer: WorkflowContainerNode,
};
