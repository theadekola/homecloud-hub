# Proxmox review corrections

The corrections cover the eight issues reproduced on main at 73c62d119894a7360b9ccc9215904b3746749732.

| Area | Corrected behavior |
| --- | --- |
| Network configuration | Details follow refreshed interface readings. An open editor retains its draft, detects changed or removed configuration, blocks stale saves and offers an explicit reload that discards unsaved input. |
| Network API | New edit requests carry the original configuration. The server re-reads the selected node's interfaces and rejects changed or missing configuration with HTTP 409 before writing. Runtime status and traffic metadata are excluded from comparisons. |
| Tasks & Logs | Stop results and errors are associated with the selection generation that initiated the request. Switching or closing the selection prevents a late response from changing another task's details. |
| VM guest agent | Both numeric and named enabled options are recognized. Missing configuration is Unknown, rather than Disabled. |
| Overview health | Failed inventory refreshes show Unknown health until a successful recheck; unrelated task-inspection errors do not change cluster health. |
| Services shortcuts | Overview links open the clicked node's Services section. Node identity and section are preserved in the URL, including initial loading of a direct link. |
| Node errors | Detail request errors remain visible across node detail sections. |
| Tab navigation | Main tabs update the URL, preserve unrelated query parameters, and support reload and browser history. Create VM/CT shortcuts consume their action without losing their tab. |
| VM text | Corrupted separator characters were replaced with readable separators. |

The existing seven-tab layout and deliberately removed legacy controls remain intact. Proxmox authentication, role gates, SSH approval, typed confirmation and auditing remain unchanged. Network edits still stage configuration; this change does not apply network changes or perform guest power actions.

The configuration comparison is a pre-write check, not a provider transaction or lock. External administrators should avoid simultaneous editing. Existing API clients without the new expectedConfig field retain their existing behavior.

Regression tests use mocked APIs and a captured write function. They cover network conflicts and reload, selection races, status parsing, failures and recovery, node links, URL history and creation shortcuts. No live node, VM, container, interface or task was changed during development.
