mergeInto(LibraryManager.library, {
  HundredReturnHome: function (urlPtr) {
    window.location.assign(UTF8ToString(urlPtr));
  },
  HundredCopyRoomId: function (valuePtr, receiverPtr) {
    var value = UTF8ToString(valuePtr);
    var receiver = UTF8ToString(receiverPtr);
    var report = function (ok) {
      SendMessage(receiver, 'OnRoomIdCopied', ok ? 'ok' : 'failed');
    };
    var fallback = function () {
      var previous = document.activeElement;
      var field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      var ok = false;
      try {
        field.focus();
        field.select();
        ok = document.execCommand('copy');
      } catch (error) {
        ok = false;
      } finally {
        field.remove();
        if (previous && previous.focus) previous.focus();
      }
      report(ok);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(function () { report(true); }, fallback);
    } else {
      fallback();
    }
  }
});
