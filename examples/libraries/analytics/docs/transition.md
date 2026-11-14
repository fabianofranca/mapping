# Transition

Annotation of an **arrow**: describes the move from the source marking to the destination marking in a flow, usually from one screen to another.

## Fields

- **Condition**: when the transition happens (tap on Subscribe, payment approved, session expired).
- **Event** (optional): the name of the analytics event fired on the move. If you want its properties, annotate the event with the **Event** type and link it to the element that fires it.

## How to use

This type applies only to arrows, not to rectangular markings: drag an arrow from the marking of the source screen to that of the destination screen and annotate the arrow in the Analytics layer. The source and the destination are those of the arrow itself, so the annotation does not repeat the names of the screens.

## For the agent

Read the transition through the arrows of the source marking (`arrows`): the arrow's annotation of type `transition` carries `condition` and, if any, `event`. To create one, link the two markings with `create_arrow` and annotate the arrow with the type `transition`.
