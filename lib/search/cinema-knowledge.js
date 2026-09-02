export function createCinemaKnowledge({ graph }) {
  if (!graph) throw new TypeError('cinema knowledge requires a graph');
  return {
    relations: (id, options = {}) => graph.traverse(id, options),
    explain: (fromId, toId, options = {}) => graph.explainPath(fromId, toId, options)
  };
}
