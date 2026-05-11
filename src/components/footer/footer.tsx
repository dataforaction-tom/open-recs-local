import { Container } from '@/components/ui/container';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-rule bg-background py-8">
      <Container className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="font-serif text-sm italic text-muted-foreground">
          open recommendations · a local-first instrument for inquiry reports.
        </p>
        <a
          href="https://github.com/dataforaction-tom/open-recs-local"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-accent"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source
        </a>
      </Container>
    </footer>
  );
}
