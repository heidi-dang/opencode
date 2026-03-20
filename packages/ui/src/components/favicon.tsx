import { Link, Meta } from "@solidjs/meta"

import ico from "../assets/favicon/favicon-v3.ico"
import png from "../assets/favicon/favicon-96x96-v3.png"
import svg from "../assets/favicon/favicon-v3.svg"
import man from "../assets/favicon/site.webmanifest"
import touch from "../assets/favicon/apple-touch-icon-v3.png"

export const Favicon = () => {
  return (
    <>
      <Link rel="icon" type="image/png" href={png} sizes="96x96" />
      <Link rel="icon" type="image/svg+xml" href={svg} />
      <Link rel="shortcut icon" href={ico} />
      <Link rel="apple-touch-icon" sizes="180x180" href={touch} />
      <Link rel="manifest" href={man} />
      <Meta name="apple-mobile-web-app-title" content="OpenCode" />
    </>
  )
}
