import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  project,
  currentDiagramId,
  addBox,
  updateBox,
  createDiagram,
  navigateTo,
  removeDecomposition,
  resetProject,
} from './model.js'

beforeEach(() => {
  resetProject()
})

describe('removeDecomposition', () => {
  it('removes single-level decomposition: childDiagramId set to null, child diagram deleted', () => {
    const box = addBox({ id: 'b1', label: 'Step' }, 'A0')
    createDiagram('A1', 'Child', 'A0')
    updateBox('b1', { childDiagramId: 'A1' }, 'A0')

    removeDecomposition('b1', 'A0')

    assert.equal(box.childDiagramId, null)
    assert.equal(project.diagrams['A1'], undefined)
  })

  it('removes nested decomposition: grandchild diagram also deleted', () => {
    const box = addBox({ id: 'b1', label: 'Step' }, 'A0')
    createDiagram('A1', 'Child', 'A0')
    const grandBox = addBox({ id: 'gb1', label: 'Sub-step' }, 'A1')
    createDiagram('A11', 'Grandchild', 'A1')
    updateBox('gb1', { childDiagramId: 'A11' }, 'A1')
    updateBox('b1', { childDiagramId: 'A1' }, 'A0')

    removeDecomposition('b1', 'A0')

    assert.equal(box.childDiagramId, null)
    assert.equal(project.diagrams['A1'], undefined)
    assert.equal(project.diagrams['A11'], undefined)
  })

  it('no-op on box without childDiagramId', () => {
    addBox({ id: 'b1', label: 'Step' }, 'A0')
    const diagramsBefore = Object.keys(project.diagrams).join(',')

    removeDecomposition('b1', 'A0')

    assert.equal(Object.keys(project.diagrams).join(','), diagramsBefore)
  })

  it('no-op on unknown boxId', () => {
    const diagramsBefore = Object.keys(project.diagrams).join(',')

    removeDecomposition('nonexistent', 'A0')

    assert.equal(Object.keys(project.diagrams).join(','), diagramsBefore)
  })

  it('navigate-away: if currentDiagramId equals the child diagram, navigates to parent before deleting', () => {
    const box = addBox({ id: 'b1', label: 'Step' }, 'A0')
    createDiagram('A1', 'Child', 'A0')
    updateBox('b1', { childDiagramId: 'A1' }, 'A0')

    navigateTo('A1')
    assert.equal(currentDiagramId.value, 'A1')

    removeDecomposition('b1', 'A0')

    assert.equal(currentDiagramId.value, 'A0')
    assert.equal(project.diagrams['A1'], undefined)
  })

  it('navigate-away: if currentDiagramId is a descendant, navigates to parent before deleting', () => {
    const box = addBox({ id: 'b1', label: 'Step' }, 'A0')
    createDiagram('A1', 'Child', 'A0')
    const grandBox = addBox({ id: 'gb1', label: 'Sub' }, 'A1')
    createDiagram('A11', 'Grandchild', 'A1')
    updateBox('gb1', { childDiagramId: 'A11' }, 'A1')
    updateBox('b1', { childDiagramId: 'A1' }, 'A0')

    navigateTo('A11')
    assert.equal(currentDiagramId.value, 'A11')

    removeDecomposition('b1', 'A0')

    assert.equal(currentDiagramId.value, 'A0')
    assert.equal(project.diagrams['A1'], undefined)
    assert.equal(project.diagrams['A11'], undefined)
  })
})
