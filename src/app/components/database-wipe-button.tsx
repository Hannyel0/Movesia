import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";

export default function DatabaseWipeButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  const handleWipeDatabase = async () => {
    try {
      setIsWiping(true);
      // Call the IPC handler to wipe the database
      const result = await window.electron.ipcRenderer.invoke('wipe-database');
      
      if (result.success) {
        console.log("✅ Database wiped successfully:", result.message);
        alert(`Database wiped successfully!\n\n${result.message}`);
      } else {
        console.error("❌ Failed to wipe database:", result.message);
        alert(`Failed to wipe database!\n\n${result.message}`);
      }
    } catch (error) {
      console.error("❌ Error wiping database:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Error wiping database!\n\n${errorMessage}`);
    } finally {
      setIsWiping(false);
      setIsDialogOpen(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setIsDialogOpen(true)}
        className="flex items-center gap-2"
      >
        <Trash2 className="h-4 w-4" />
        Wipe Database
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wipe Database</DialogTitle>
            <DialogDescription>
              This will permanently delete all data from the Movesia database including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All Unity events history</li>
                <li>Asset metadata and dependencies</li>
                <li>Scene information</li>
                <li>Vector embeddings (requires restart to clear)</li>
              </ul>
              <strong className="text-red-600 block mt-3">
                This action cannot be undone.
              </strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isWiping}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleWipeDatabase}
              disabled={isWiping}
              className="flex items-center gap-2"
            >
              {isWiping ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Wiping...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Wipe Database
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
