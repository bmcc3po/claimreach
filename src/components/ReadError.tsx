export default function ReadError({ title, message, href }: { title: string; message: string; href: string }) {
  return <section className="card"><h1 className="cl-h1">{title}</h1><p role="alert">{message}</p><a className="btn" href={href}>Try again</a></section>;
}
