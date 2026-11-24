import { Link } from 'react-router';
import { PageHeader } from '../components/ui';
import { useDocumentTitle } from '../hooks/useNow';

const STACK: { name: string; why: string }[] = [
  { name: 'C# and ASP.NET Core 10 (Web API)', why: 'Controllers, validation, cookie authentication, rate limiting, and ProblemDetails errors.' },
  { name: 'Entity Framework Core + SQLite', why: 'Code-first migrations and a single-file SQL database that persists between restarts.' },
  { name: 'ASP.NET Core SignalR', why: 'Pushes seat changes to everyone viewing the same showtime.' },
  { name: 'React 19 + TypeScript + Vite', why: 'The browser app, with type-checked API models.' },
  { name: 'Tailwind CSS 4', why: 'Styling with a small set of design tokens.' },
  { name: 'xUnit, Vitest, Testing Library', why: 'Automated tests for pricing, booking rules, concurrency, the API, and the UI.' },
  { name: 'GitHub Actions', why: 'A CI workflow that builds and tests the backend and frontend on each push.' },
];

export function AboutPage() {
  useDocumentTitle('About');
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="About this project" title="Movie Theater Ticket System">
        <p>
          This is an <strong className="text-white">expanded portfolio rebuild</strong> of Nathanael Haig&apos;s academic C# desktop
          project, rebuilt as a full-stack web application. It is not the original coursework submission.
        </p>
      </PageHeader>

      <section className="card space-y-3 p-6" aria-labelledby="origin-heading">
        <h2 id="origin-heading" className="font-display text-2xl font-bold text-white">
          Where it started
        </h2>
        <p className="text-ink-300">
          The original project was a C# desktop application for movie selection, seat booking, checkout, and ticket and concession
          pricing. Nathanael designed the user interface flow and implemented the ticket and concession pricing logic.
        </p>
        <p className="text-ink-300">
          This version keeps those ideas and adds a web front end, a SQL database, live seat availability, seat holds that expire,
          order history and cancellation, and an admin dashboard.
        </p>
      </section>

      <section className="card space-y-4 p-6" aria-labelledby="demo-heading">
        <h2 id="demo-heading" className="font-display text-2xl font-bold text-white">
          Demo rules
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-ink-300">
          <li>Every movie, synopsis, and customer in the sample data is fictional. Poster art is drawn with SVG.</li>
          <li>Payments are simulated. The app never asks for card details and no money moves.</li>
          <li>
            The admin area uses a local demo account configured on the server. It is not a real credential.{' '}
            <Link to="/admin" className="text-marquee-300 underline">
              Open the admin dashboard
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="card p-6" aria-labelledby="stack-heading">
        <h2 id="stack-heading" className="mb-4 font-display text-2xl font-bold text-white">
          Technology
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {STACK.map((item) => (
            <div key={item.name} className="rounded-xl border border-white/5 bg-ink-900/60 p-4">
              <dt className="font-semibold text-white">{item.name}</dt>
              <dd className="mt-1 text-sm text-ink-300">{item.why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card space-y-2 p-6" aria-labelledby="credits-heading">
        <h2 id="credits-heading" className="font-display text-2xl font-bold text-white">
          Credits
        </h2>
        <p className="text-ink-300">Built by Nathanael Haig and Tracy Tran.</p>
        <p className="text-ink-300">Original academic desktop project: Nathanael Haig, Information Systems, California State University, Fullerton.</p>
        <p className="text-sm text-ink-500">MIT License · Copyright © 2026 Nathanael Haig and Tracy Tran</p>
      </section>
    </div>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div>
      <PageHeader eyebrow="404" title="This page isn't showing">
        The link may be old or mistyped.
      </PageHeader>
      <Link to="/" className="btn btn-primary">
        Back to showtimes
      </Link>
    </div>
  );
}
