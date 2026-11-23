# Event

The table of an analytics event, loose on the canvas: the event name in a purple header and one row per property sent with it.

## Fields

- **Name** (required): the event name as the SDK receives it, for example `checkout_started`. Typing suggests the names of the library (the tokens of the `events` group; the deprecated `purchase_done` is not suggested).
- **Properties**: one row per property, with its name (required) and the **Value**: a fixed value or where it comes from.

## How the event links to the element

The event is a **floating** marking: it lives only on the canvas, is drawn above everything and does not belong to any screen. It is linked to the element that fires it by an **arrow**, not by a field: drag an arrow from the event to the marking of the button, the field or the screen that fires it. The data stays in the event; whoever reads the mapping reaches it through the arrows that arrive at the element.

To describe the move between two screens of a flow, use the **Transition** annotation on the arrow between the screens' markings, and repeat the event name in it if the event goes with the move.

## Example

Name `checkout_started`, with the properties `source` = `cart`, `items` = `3` and `total` = `149.90`, linked by an arrow to the Checkout button.

## For the agent

Read the event with `get_marking`: the name and the `properties` (`property` and `value`) are in the values of the annotation of type `event`. To find out what fires the event, look at the marking's arrows, in `arrows`. To create one, run `create_marking` on the canvas (with `near` to place it beside the container), an `event` annotation with the name and the properties, and link it to the element with `create_arrow`.
