package com.gazonride.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Serves files from cache/share/ to the app chosen in the share sheet
 *  (Instagram, WhatsApp…). Read-only, per-share URI grants only. */
public class ShareProvider extends ContentProvider {
    static final String AUTHORITY = "com.gazonride.app.share";
    static File dir(android.content.Context c){ File d=new File(c.getCacheDir(),"share"); d.mkdirs(); return d; }
    private File file(Uri uri) throws FileNotFoundException {
        String name=uri.getLastPathSegment();
        if(name==null||name.contains("/")||name.contains(".."))throw new FileNotFoundException();
        File f=new File(dir(getContext()),name);
        if(!f.exists())throw new FileNotFoundException(name);
        return f;
    }
    @Override public boolean onCreate(){ return true; }
    @Override public String getType(Uri uri){
        String n=uri.getLastPathSegment()==null?"":uri.getLastPathSegment().toLowerCase();
        if(n.endsWith(".mp4"))return "video/mp4";
        if(n.endsWith(".webm"))return "video/webm";
        if(n.endsWith(".png"))return "image/png";
        if(n.endsWith(".jpg"))return "image/jpeg";
        return "application/octet-stream";
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        try{
            File f=file(uri);
            MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(),f.length()});
            return c;
        }catch(FileNotFoundException e){ return null; }
    }
    @Override public Uri insert(Uri uri,ContentValues v){ return null; }
    @Override public int delete(Uri uri,String s,String[] a){ return 0; }
    @Override public int update(Uri uri,ContentValues v,String s,String[] a){ return 0; }
}
