import test from 'node:test'
import assert from 'node:assert/strict'
import { expression, latest, validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { pointRadiusExpression } from '../lib/map-style.js'

test('medical markers validate and scale with both zoom and capacity', () => {
  const radius = pointRadiusExpression()
  assert.deepEqual(validateStyleMin({
    version: 8,
    sources: { points: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers: [{ id: 'points', type: 'circle', source: 'points', paint: { 'circle-radius': radius } }],
  }), [])
  const compiled = expression.createPropertyExpression(radius, latest.paint_circle['circle-radius'])
  assert.equal(compiled.result, 'success')
  const evaluate = (zoom, properties) => compiled.value.evaluate({ zoom }, { type: 'Point', properties })
  assert.equal(evaluate(3, { _medicalPointScale: 2 }), 8)
  assert.equal(evaluate(9, { _medicalPointScale: 2 }), 13)
  assert.equal(evaluate(13, { _medicalPointScale: 2 }), 19)
  assert.equal(evaluate(9, { _medicalPointScale: 1 }), 6.5)
  assert.equal(evaluate(9, {}), 6.5)
})
