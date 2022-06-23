import { gql } from '@apollo/client';
export const QUERY = gql`query getPage($bookId: Float!, $pageIndex: Float!){
    getPage(bookId: $bookId, pageIndex: $pageIndex){
        bookId
        createdTime
        pageElement{
            bookId
            createdTime
            lSize{
                height
                width
            }
            hSize{
                height
                width
            }
            pageIndex
            updatedTime
        }
        pageIndex
        pageName
        updatedTime
    }
}`