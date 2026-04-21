# Refactor Prompt

Use this prompt when refactoring any module or layer.

---

## How to use

```
Using the brain.json context, refactor [MODULE/LAYER] to [GOAL].

Before any changes:
1. Map all nodes affected by this refactor
2. List dependents and the contracts I must preserve
3. Show me the before/after architecture in the graph
4. Present the full execution plan and wait for my approval

Constraints:
- [ ] Public interfaces must not change
- [ ] Existing tests must still pass
- [ ] No new external dependencies without explicit approval

After refactoring, update brain.json automatically.
```

---

## Example

```
Using the brain.json context, refactor the data layer to follow Clean Architecture
(separate DataSource, Repository, and UseCase layers).

Before any changes:
1. Map all nodes affected by this refactor
2. List dependents and the contracts I must preserve
3. Show me the before/after architecture in the graph
4. Present the full execution plan and wait for my approval

Constraints:
- [ ] Public interfaces must not change
- [ ] Existing tests must still pass
- [ ] No new external dependencies without explicit approval

After refactoring, update brain.json automatically.
```
