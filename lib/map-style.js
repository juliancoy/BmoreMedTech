// Camera expressions must interpolate zoom at the top level. Feature scaling
// belongs inside each stop so MapLibre can validate and render point layers.
export function pointRadiusExpression() {
  const scale = ['coalesce', ['get', '_medicalPointScale'], 1]
  return [
    'interpolate', ['linear'], ['zoom'],
    3, ['*', 4, scale],
    9, ['*', 6.5, scale],
    13, ['*', 9.5, scale],
  ]
}
