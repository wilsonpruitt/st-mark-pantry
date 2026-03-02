import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, HandHeart, CalendarPlus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {number}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export function VolunteerGuide() {
  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Volunteer Guide</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        A quick walkthrough of common tasks in the St. Mark Food Pantry app.
      </p>

      {/* Section 1: Recording Client Visits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-green-600" />
            Recording Client Visits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            When a client arrives at the pantry, check them in so we can track who we've served.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              Tap <strong>Start Check-In</strong> from the dashboard, or tap <strong>Check-In</strong> in the bottom navigation.
            </Step>
            <Step number={2}>
              Make sure the correct <strong>day</strong> is selected at the top (Monday, Friday, or Saturday).
            </Step>
            <Step number={3}>
              <strong>Search</strong> for the client by typing their name. Select their name from the results.
            </Step>
            <Step number={4}>
              If the client is <strong>new</strong>, tap "Register Client" to add them first, then come back to check them in.
            </Step>
            <Step number={5}>
              The client will appear in the <strong>Recent Check-Ins</strong> list on the dashboard and in reports.
            </Step>
          </div>
          <Link
            to="/checkin"
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Go to Check-In <ChevronRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      {/* Section 2: Logging Your Volunteer Shift */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandHeart className="size-5 text-purple-600" />
            Logging Your Volunteer Shift
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            When you arrive to volunteer, log your shift so we can track volunteer hours.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              Go to <strong>Volunteers</strong> in the bottom navigation, then tap <strong>Check In</strong> at the top.
            </Step>
            <Step number={2}>
              The correct pantry day should already be selected. Search for <strong>your name</strong>.
            </Step>
            <Step number={3}>
              Optionally select your <strong>role</strong> (Intake, Distribution, Setup, Cleanup, etc.) from the dropdown next to your name.
            </Step>
            <Step number={4}>
              Tap the <strong>check-in button</strong> next to your name. You'll see a confirmation that your shift was recorded.
            </Step>
          </div>
          <Link
            to="/volunteers/checkin"
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Go to Volunteer Check-In <ChevronRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      {/* Section 3: Signing Up for Future Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5 text-blue-600" />
            Signing Up for Future Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sign up ahead of time so the team knows who's coming for upcoming pantry sessions.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              Go to <strong>Volunteers</strong> in the bottom navigation, then tap <strong>Schedule</strong> at the top.
            </Step>
            <Step number={2}>
              You'll see the next 4 weeks of pantry sessions. Find the date you want to volunteer for.
            </Step>
            <Step number={3}>
              Tap the <strong>Sign Up</strong> button next to that date.
            </Step>
            <Step number={4}>
              Search for your name, optionally pick a role, then tap <strong>Sign Up</strong> to confirm.
            </Step>
            <Step number={5}>
              If you have a <strong>recurring schedule</strong> set up, you'll automatically appear on those dates — no need to sign up each time.
            </Step>
          </div>
          <p className="text-xs text-muted-foreground">
            Need to cancel? Tap the <strong>X</strong> button next to your name on any scheduled date.
          </p>
          <Link
            to="/volunteers/schedule"
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Go to Schedule <ChevronRight className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
