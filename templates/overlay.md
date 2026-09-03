# overlay grammar

blocks at column 0; body indent 2.

@replace <section-name>      # the workspace's version stands in for the
                             # base section; the base text still loads and
                             # can compete - use with discretion, prefer
                             # @append
@append <section-name>       # added after the named base section
  <the workspace's lines>
