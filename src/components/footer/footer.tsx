import { Container } from '@/components/ui/container';

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-6 text-sm text-muted-foreground">
      <Container className="flex items-center justify-between">
        <span>open-recs-local — local-first open recommendations</span>
        <a
          href="https://github.com/dataforaction-tom/open-recs-local"
          className="hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </Container>
    </footer>
  );
}
