import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

const APP_URL = 'https://st-mark-pantry.vercel.app';

function QRCard() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 print:border-gray-400 print:p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-black/60">
        St. Mark Food Pantry
      </p>
      <QRCodeSVG value={APP_URL} size={128} level="M" />
      <p className="text-sm font-medium print:text-black">Scan to open the app</p>
    </div>
  );
}

export function QRPrintPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24 print:pb-0">
      {/* Header — hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/guide">
              <ArrowLeft className="size-4" />
              Guide
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Print QR Codes</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print
        </Button>
      </div>

      <p className="text-sm text-muted-foreground print:hidden">
        Print this page and cut along the dashed lines. Each QR code opens the pantry app.
      </p>

      {/* 2x3 grid of QR cards */}
      <div className="grid grid-cols-2 gap-4 print:gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <QRCard key={i} />
        ))}
      </div>
    </div>
  );
}
