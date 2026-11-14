# Avatar

The round photo of a person with the name beside it, for screens with a contact list, profile or comments.

## Fields

- **Nome** (required): the name of the person as it appears on the screen.
- **Foto**: the `https://` URL of the photo, copied from the work source. Do not make up the URL: if the source does not have it, leave the field empty.

## How the photo appears

The photo is a remote image. It is only requested from the network after the person allows that origin in the app; until then, and if the URL is refused or fails, the avatar shows the placeholder (the gray box with an X). Nothing but the URL is saved in the project.

## Example

Name `Ana Souza` and photo `https://exemplo.invalid/ana.png` (an example address, which never loads).

## For the agent

Read the avatar with `get_marking`: `nome` and `foto` are in the values of the `avatar` annotation type. Fill `foto` only with the `https://` URL that the source gives; the MCP server never downloads the image.
