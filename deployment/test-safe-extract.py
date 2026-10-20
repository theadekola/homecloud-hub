import io,pathlib,subprocess,sys,tarfile,tempfile,unittest
helper=str(pathlib.Path(__file__).with_name('safe-extract.py'))
class SafeRestoreTests(unittest.TestCase):
 def test_rejects_traversal_and_links(self):
  for name,kind in [('../escape',tarfile.REGTYPE),('/absolute',tarfile.REGTYPE),('link',tarfile.SYMTYPE)]:
   with tempfile.TemporaryDirectory() as root:
    archive=pathlib.Path(root)/'backup.tar'
    with tarfile.open(archive,'w') as out:
     entry=tarfile.TarInfo(name);entry.type=kind;entry.linkname='/etc';out.addfile(entry)
    result=subprocess.run([sys.executable,helper,str(archive),str(pathlib.Path(root)/'target')],capture_output=True)
    self.assertNotEqual(result.returncode,0)
 def test_restores_regular_files(self):
  with tempfile.TemporaryDirectory() as root:
   archive=pathlib.Path(root)/'backup.tar'
   with tarfile.open(archive,'w') as out:
    entry=tarfile.TarInfo('runtime/state.json');entry.size=2;out.addfile(entry,io.BytesIO(b'{}'))
   subprocess.run([sys.executable,helper,str(archive),str(pathlib.Path(root)/'target')],check=True)
   self.assertEqual((pathlib.Path(root)/'target/runtime/state.json').read_text(),'{}')
unittest.main()
