# Event conventions

General rules for the events mapped with this library. They belong to no single type: the Event and
the Transition follow them both.

## Names

- An event name is `snake_case`, a noun phrase followed by a past-tense verb: `checkout_started`,
  `item_added`, `payment_failed`. Never `ClickButton` or `click-button`.
- One name, one meaning: reuse the name of an event that already exists instead of creating a
  variant (`item_added`, not `item_added_v2` or `add_item`).
- A screen view is `<screen>_viewed`; a tap is `<target>_tapped`.

## Properties

- A property name is `snake_case` too, and says what the value is, not where it came from:
  `item_count`, `payment_method`.
- Put in a property only what the analysis needs; no names, e-mails or other personal data.
- Keep one type per property across events: `item_count` is always a number.

## On the canvas

- The Event is a floating annotation linked by an arrow to the element that fires it.
- The Transition goes on the arrow between the source and the destination of a flow, and names the
  event the move fires. Do not repeat the event's properties in the Transition.
