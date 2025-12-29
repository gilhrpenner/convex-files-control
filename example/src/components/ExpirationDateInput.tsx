import { format } from "date-fns";
import { CalendarIcon, Clock, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import React from "react";

interface ExpirationDateInputProps {
  onDateChange?: (date: Date | null) => void;
}

export function ExpirationDateInput({ onDateChange }: ExpirationDateInputProps) {
  const [date, setDate] = React.useState<Date>();
  const [time, setTime] = React.useState("12:00");

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTime(e.target.value);
  };

  // Combine date and time for display or value usage
  const dateTime = React.useMemo(() => {
    if (!date) return undefined;
    const [hours, minutes] = time.split(":").map(Number);
    const newDate = new Date(date);
    newDate.setHours(hours || 0);
    newDate.setMinutes(minutes || 0);
    return newDate;
  }, [date, time]);

  React.useEffect(() => {
    onDateChange?.(dateTime ?? null);
  }, [dateTime, onDateChange]);

  return (
    <div className="grid w-full items-center gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="date" className="text-sm font-medium">
          Expiration Date
        </Label>
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex items-center justify-center p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-help outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
              <Info className="h-3 w-3 text-muted-foreground" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>File Expiration</DialogTitle>
              <DialogDescription className="text-foreground/80 pt-2 leading-relaxed">
                By default, files do not expire. If you set an expiration date, you must configure a cron job to trigger the cleanup function.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 hover:text-foreground",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateTime ? (
              format(dateTime, "PPP p")
            ) : (
              <span>Pick a date (Optional)</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            initialFocus
            className="rounded-md border border-white/10 bg-card"
          />
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="time" className="text-sm">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={handleTimeChange}
                className="h-8 w-full"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
